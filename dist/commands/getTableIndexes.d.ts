import type sql from 'mssql';
export declare function getTableIndexes(pool: sql.ConnectionPool, client: typeof sql, table: string, schema?: string): Promise<Record<string, unknown>[]>;
//# sourceMappingURL=getTableIndexes.d.ts.map