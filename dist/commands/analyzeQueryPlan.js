import { XMLParser } from 'fast-xml-parser';
import { inspect } from 'node:util';
import { connectDedicated } from '../db.js';
const showplanParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: true,
});
function asArray(value) {
    if (value === undefined || value === null) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}
function attrString(value) {
    return value === undefined || value === null ? undefined : String(value);
}
function attrNumber(value) {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
}
function attrBool(value) {
    return value === true || value === 1 || value === 'true' || value === '1';
}
function walkXml(node, visit, key = '') {
    if (Array.isArray(node)) {
        for (const item of node) {
            walkXml(item, visit, key);
        }
        return;
    }
    if (node !== null && typeof node === 'object') {
        visit(key, node);
        for (const [childKey, childValue] of Object.entries(node)) {
            if (!childKey.startsWith('@_')) {
                walkXml(childValue, visit, childKey);
            }
        }
    }
}
function formatObjectName(object) {
    const parts = [object['@_Database'], object['@_Schema'], object['@_Table'], object['@_Index']]
        .map(attrString)
        .filter((part) => Boolean(part));
    return parts.length > 0 ? parts.join('.') : undefined;
}
function extractOperator(relOp) {
    const operator = {
        physicalOp: attrString(relOp['@_PhysicalOp']) ?? 'Unknown',
        logicalOp: attrString(relOp['@_LogicalOp']) ?? 'Unknown',
        estimatedRows: attrNumber(relOp['@_EstimateRows']),
        estimatedSubtreeCost: attrNumber(relOp['@_EstimatedTotalSubtreeCost']) ?? 0,
    };
    for (const [key, child] of Object.entries(relOp)) {
        if (key.startsWith('@_') || key === 'RelOp' || child === null || typeof child !== 'object') {
            continue;
        }
        const childNode = child;
        const objects = asArray(childNode.Object);
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
function extractWarnings(node) {
    const warnings = [];
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
        for (const child of asArray(value)) {
            if (child === null || typeof child !== 'object') {
                warnings.push(key);
                continue;
            }
            const childNode = child;
            const detail = [attrString(childNode['@_ConvertIssue']), attrString(childNode['@_Expression'])]
                .filter(Boolean)
                .join(': ');
            warnings.push(detail ? `${key} (${detail})` : key);
        }
    }
    return warnings;
}
function stripBrackets(value) {
    return value.replace(/[[\]]/g, '');
}
function extractMissingIndex(group) {
    const suggestion = {
        impact: attrNumber(group['@_Impact']),
        equalityColumns: [],
        inequalityColumns: [],
        includeColumns: [],
    };
    const missingIndex = asArray(group.MissingIndex)[0];
    if (!missingIndex) {
        return suggestion;
    }
    const database = attrString(missingIndex['@_Database']);
    const schema = attrString(missingIndex['@_Schema']);
    const table = attrString(missingIndex['@_Table']);
    suggestion.table = [database, schema, table].filter(Boolean).join('.') || undefined;
    for (const columnGroup of asArray(missingIndex.ColumnGroup)) {
        const usage = attrString(columnGroup['@_Usage']);
        const columns = asArray(columnGroup.Column)
            .map((column) => attrString(column['@_Name']))
            .filter((name) => Boolean(name));
        if (usage === 'EQUALITY') {
            suggestion.equalityColumns.push(...columns);
        }
        else if (usage === 'INEQUALITY') {
            suggestion.inequalityColumns.push(...columns);
        }
        else if (usage === 'INCLUDE') {
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
function detectIssues(operators, statementCost) {
    const issues = new Set();
    for (const op of operators) {
        const target = op.object ? ` em ${op.object}` : '';
        if (op.lookup) {
            issues.add(`Key Lookup${target} — considere adicionar colunas INCLUDE ao índice usado`);
        }
        else if (op.physicalOp === 'RID Lookup') {
            issues.add(`RID Lookup${target} — tabela heap; considere um índice clustered ou covering index`);
        }
        else if (op.physicalOp === 'Table Scan') {
            issues.add(`Table Scan${target} — leitura completa de tabela sem índice`);
        }
        else if (op.physicalOp === 'Clustered Index Scan' || op.physicalOp === 'Index Scan') {
            issues.add(`${op.physicalOp}${target} — leitura completa do índice`);
        }
        else if ((op.physicalOp === 'Sort' || op.physicalOp === 'Hash Match') &&
            statementCost !== undefined &&
            statementCost > 0.05 &&
            op.estimatedSubtreeCost >= statementCost * 0.3) {
            issues.add(`Operador custoso: ${op.physicalOp} (custo estimado ${op.estimatedSubtreeCost})`);
        }
    }
    return [...issues];
}
function analyzeStatement(stmt) {
    const estimatedCost = attrNumber(stmt['@_StatementSubTreeCost']);
    const operators = [];
    const warnings = new Set();
    const missingIndexes = [];
    walkXml(stmt, (key, node) => {
        if (key === 'RelOp') {
            operators.push(extractOperator(node));
        }
        else if (key === 'Warnings') {
            for (const warning of extractWarnings(node)) {
                warnings.add(warning);
            }
        }
        else if (key === 'MissingIndexGroup') {
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
export function parseShowplan(xml) {
    const doc = showplanParser.parse(xml);
    const showPlan = doc.ShowPlanXML;
    const batchSequence = showPlan?.BatchSequence;
    const statements = [];
    for (const batch of asArray(batchSequence?.Batch)) {
        for (const stmtContainer of asArray(batch.Statements)) {
            for (const [key, value] of Object.entries(stmtContainer)) {
                if (!key.startsWith('Stmt')) {
                    continue;
                }
                for (const stmt of asArray(value)) {
                    statements.push(analyzeStatement(stmt));
                }
            }
        }
    }
    return statements;
}
function formatError(error) {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    try {
        return JSON.stringify(error, null, 2);
    }
    catch {
        return inspect(error, { depth: 6, breakLength: 120 });
    }
}
async function getEstimatedPlanXml(authMode, overrides, query) {
    const { pool } = await connectDedicated(overrides);
    try {
        await pool.request().batch('SET SHOWPLAN_XML ON');
        const result = await pool.request().batch(query);
        const recordsets = asArray(result.recordsets);
        const plans = [];
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
    }
    finally {
        await pool.close();
    }
}
export async function analyzeQueryPlan(authMode, overrides, query, includeRawPlan = false) {
    const plans = await getEstimatedPlanXml(authMode, overrides, query);
    const statements = [];
    const parseErrors = [];
    for (const xml of plans) {
        try {
            statements.push(...parseShowplan(xml));
        }
        catch (parseError) {
            parseErrors.push(formatError(parseError));
        }
    }
    const output = { statements };
    if (parseErrors.length > 0) {
        output.parseErrors = parseErrors;
    }
    if (includeRawPlan || parseErrors.length > 0) {
        output.rawPlan = plans.join('\n');
    }
    return output;
}
//# sourceMappingURL=analyzeQueryPlan.js.map