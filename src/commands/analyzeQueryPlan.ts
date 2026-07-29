import { XMLParser } from 'fast-xml-parser';
import { inspect } from 'node:util';
import { connectDedicated, type ConnectionOverrides } from '../db.js';

// ---------------------------------------------------------------------------
// Análise de plano de execução (SHOWPLAN_XML)
// ---------------------------------------------------------------------------
export interface PlanOperator {
  physicalOp: string;
  logicalOp: string;
  estimatedRows?: number;
  estimatedSubtreeCost: number;
  object?: string;
  lookup?: boolean;
}

export interface MissingIndexSuggestion {
  impact?: number;
  table?: string;
  equalityColumns: string[];
  inequalityColumns: string[];
  includeColumns: string[];
  suggestedCreateStatement?: string;
}

export interface StatementAnalysis {
  statementText: string;
  estimatedRows?: number;
  estimatedCost?: number;
  operators: PlanOperator[];
  warnings: string[];
  issues: string[];
  missingIndexes: MissingIndexSuggestion[];
}

type XmlNode = Record<string, unknown>;

const showplanParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: true,
});

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function attrString(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : String(value);
}

function attrNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function attrBool(value: unknown): boolean {
  return value === true || value === 1 || value === 'true' || value === '1';
}

function walkXml(node: unknown, visit: (key: string, value: XmlNode) => void, key = ''): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      walkXml(item, visit, key);
    }
    return;
  }
  if (node !== null && typeof node === 'object') {
    visit(key, node as XmlNode);
    for (const [childKey, childValue] of Object.entries(node)) {
      if (!childKey.startsWith('@_')) {
        walkXml(childValue, visit, childKey);
      }
    }
  }
}

function formatObjectName(object: XmlNode): string | undefined {
  const parts = [object['@_Database'], object['@_Schema'], object['@_Table'], object['@_Index']]
    .map(attrString)
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join('.') : undefined;
}

function extractOperator(relOp: XmlNode): PlanOperator {
  const operator: PlanOperator = {
    physicalOp: attrString(relOp['@_PhysicalOp']) ?? 'Unknown',
    logicalOp: attrString(relOp['@_LogicalOp']) ?? 'Unknown',
    estimatedRows: attrNumber(relOp['@_EstimateRows']),
    estimatedSubtreeCost: attrNumber(relOp['@_EstimatedTotalSubtreeCost']) ?? 0,
  };
  for (const [key, child] of Object.entries(relOp)) {
    if (key.startsWith('@_') || key === 'RelOp' || child === null || typeof child !== 'object') {
      continue;
    }
    const childNode = child as XmlNode;
    const objects = asArray(childNode.Object as XmlNode | XmlNode[] | undefined);
    if (objects.length > 0) {
      operator.object = formatObjectName(objects[0]);
      if (attrBool(childNode['@_Lookup'])) {
        operator.lookup = true;
      }
      break;
    }
  }
  return operator;
}

function extractWarnings(node: XmlNode): string[] {
  const warnings: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('@_')) {
      if (attrBool(value)) {
        warnings.push(key.slice(2));
      }
      continue;
    }
    if (key === '#text') {
      continue;
    }
    for (const child of asArray(value as XmlNode | XmlNode[])) {
      if (child === null || typeof child !== 'object') {
        warnings.push(key);
        continue;
      }
      const childNode = child as XmlNode;
      const detail = [attrString(childNode['@_ConvertIssue']), attrString(childNode['@_Expression'])]
        .filter(Boolean)
        .join(': ');
      warnings.push(detail ? `${key} (${detail})` : key);
    }
  }
  return warnings;
}

function stripBrackets(value: string): string {
  return value.replace(/[[\]]/g, '');
}

function extractMissingIndex(group: XmlNode): MissingIndexSuggestion {
  const suggestion: MissingIndexSuggestion = {
    impact: attrNumber(group['@_Impact']),
    equalityColumns: [],
    inequalityColumns: [],
    includeColumns: [],
  };
  const missingIndex = asArray(group.MissingIndex as XmlNode | XmlNode[] | undefined)[0];
  if (!missingIndex) {
    return suggestion;
  }

  const database = attrString(missingIndex['@_Database']);
  const schema = attrString(missingIndex['@_Schema']);
  const table = attrString(missingIndex['@_Table']);
  suggestion.table = [database, schema, table].filter(Boolean).join('.') || undefined;

  for (const columnGroup of asArray(missingIndex.ColumnGroup as XmlNode | XmlNode[] | undefined)) {
    const usage = attrString(columnGroup['@_Usage']);
    const columns = asArray(columnGroup.Column as XmlNode | XmlNode[] | undefined)
      .map((column) => attrString(column['@_Name']))
      .filter((name): name is string => Boolean(name));
    if (usage === 'EQUALITY') {
      suggestion.equalityColumns.push(...columns);
    } else if (usage === 'INEQUALITY') {
      suggestion.inequalityColumns.push(...columns);
    } else if (usage === 'INCLUDE') {
      suggestion.includeColumns.push(...columns);
    }
  }

  const keyColumns = [...suggestion.equalityColumns, ...suggestion.inequalityColumns];
  if (schema && table && keyColumns.length > 0) {
    const indexName = `IX_${stripBrackets(table)}_${keyColumns.map(stripBrackets).join('_')}`;
    let createStatement = `CREATE NONCLUSTERED INDEX [${indexName}] ON ${schema}.${table} (${keyColumns.join(', ')})`;
    if (suggestion.includeColumns.length > 0) {
      createStatement += ` INCLUDE (${suggestion.includeColumns.join(', ')})`;
    }
    suggestion.suggestedCreateStatement = createStatement;
  }
  return suggestion;
}

function detectIssues(operators: PlanOperator[], statementCost?: number): string[] {
  const issues = new Set<string>();
  for (const op of operators) {
    const target = op.object ? ` em ${op.object}` : '';
    if (op.lookup) {
      issues.add(`Key Lookup${target} — considere adicionar colunas INCLUDE ao índice usado`);
    } else if (op.physicalOp === 'RID Lookup') {
      issues.add(`RID Lookup${target} — tabela heap; considere um índice clustered ou covering index`);
    } else if (op.physicalOp === 'Table Scan') {
      issues.add(`Table Scan${target} — leitura completa de tabela sem índice`);
    } else if (op.physicalOp === 'Clustered Index Scan' || op.physicalOp === 'Index Scan') {
      issues.add(`${op.physicalOp}${target} — leitura completa do índice`);
    } else if (
      (op.physicalOp === 'Sort' || op.physicalOp === 'Hash Match') &&
      statementCost !== undefined &&
      statementCost > 0.05 &&
      op.estimatedSubtreeCost >= statementCost * 0.3
    ) {
      issues.add(`Operador custoso: ${op.physicalOp} (custo estimado ${op.estimatedSubtreeCost})`);
    }
  }
  return [...issues];
}

function analyzeStatement(stmt: XmlNode): StatementAnalysis {
  const estimatedCost = attrNumber(stmt['@_StatementSubTreeCost']);
  const operators: PlanOperator[] = [];
  const warnings = new Set<string>();
  const missingIndexes: MissingIndexSuggestion[] = [];

  walkXml(stmt, (key, node) => {
    if (key === 'RelOp') {
      operators.push(extractOperator(node));
    } else if (key === 'Warnings') {
      for (const warning of extractWarnings(node)) {
        warnings.add(warning);
      }
    } else if (key === 'MissingIndexGroup') {
      missingIndexes.push(extractMissingIndex(node));
    }
  });

  operators.sort((a, b) => b.estimatedSubtreeCost - a.estimatedSubtreeCost);
  const issues = detectIssues(operators, estimatedCost);

  return {
    statementText: attrString(stmt['@_StatementText']) ?? '',
    estimatedRows: attrNumber(stmt['@_StatementEstRows']),
    estimatedCost,
    operators: operators.slice(0, 20),
    warnings: [...warnings],
    issues,
    missingIndexes,
  };
}

export function parseShowplan(xml: string): StatementAnalysis[] {
  const doc = showplanParser.parse(xml) as XmlNode;
  const showPlan = doc.ShowPlanXML as XmlNode | undefined;
  const batchSequence = showPlan?.BatchSequence as XmlNode | undefined;
  const statements: StatementAnalysis[] = [];
  for (const batch of asArray(batchSequence?.Batch as XmlNode | XmlNode[] | undefined)) {
    for (const stmtContainer of asArray(batch.Statements as XmlNode | XmlNode[] | undefined)) {
      for (const [key, value] of Object.entries(stmtContainer)) {
        if (!key.startsWith('Stmt')) {
          continue;
        }
        for (const stmt of asArray(value as XmlNode | XmlNode[])) {
          statements.push(analyzeStatement(stmt));
        }
      }
    }
  }
  return statements;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return inspect(error, { depth: 6, breakLength: 120 });
  }
}

async function getEstimatedPlanXml(
  overrides: ConnectionOverrides,
  query: string
): Promise<string[]> {
  const { pool } = await connectDedicated(overrides);
  try {
    await pool.request().batch('SET SHOWPLAN_XML ON');
    const result = await pool.request().batch(query);
    const recordsets = asArray(result.recordsets as Record<string, unknown>[][]);
    const plans: string[] = [];
    for (const recordset of recordsets) {
      for (const row of recordset) {
        const value = Object.values(row)[0];
        if (typeof value === 'string' && value.includes('<ShowPlanXML')) {
          plans.push(value);
        }
      }
    }
    if (plans.length === 0) {
      throw new Error('O SQL Server não retornou um plano de execução para a query informada.');
    }
    return plans;
  } finally {
    await pool.close();
  }
}

export interface AnalyzeQueryPlanResult {
  statements: StatementAnalysis[];
  parseErrors?: string[];
  rawPlan?: string;
}

export async function analyzeQueryPlan(
  overrides: ConnectionOverrides,
  query: string,
  includeRawPlan = false
): Promise<AnalyzeQueryPlanResult> {
  const plans = await getEstimatedPlanXml(overrides, query);
  const statements: StatementAnalysis[] = [];
  const parseErrors: string[] = [];
  for (const xml of plans) {
    try {
      statements.push(...parseShowplan(xml));
    } catch (parseError) {
      parseErrors.push(formatError(parseError));
    }
  }
  const output: AnalyzeQueryPlanResult = { statements };
  if (parseErrors.length > 0) {
    output.parseErrors = parseErrors;
  }
  if (includeRawPlan || parseErrors.length > 0) {
    output.rawPlan = plans.join('\n');
  }
  return output;
}
