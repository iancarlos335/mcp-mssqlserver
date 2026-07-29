import { type ConnectionOverrides } from '../db.js';
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
export declare function parseShowplan(xml: string): StatementAnalysis[];
export interface AnalyzeQueryPlanResult {
    statements: StatementAnalysis[];
    parseErrors?: string[];
    rawPlan?: string;
}
export declare function analyzeQueryPlan(overrides: ConnectionOverrides, query: string, includeRawPlan?: boolean): Promise<AnalyzeQueryPlanResult>;
//# sourceMappingURL=analyzeQueryPlan.d.ts.map