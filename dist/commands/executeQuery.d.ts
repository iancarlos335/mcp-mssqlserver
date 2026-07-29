import type sql from 'mssql';
export interface ExecuteQueryResult {
    rows?: Record<string, unknown>[];
    rowsAffected?: number;
}
export declare function executeQuery(pool: sql.ConnectionPool, query: string): Promise<ExecuteQueryResult>;
//# sourceMappingURL=executeQuery.d.ts.map