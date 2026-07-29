import type sql from 'mssql';
export declare function describeTable(pool: sql.ConnectionPool, client: typeof sql, table: string, schema?: string): Promise<Record<string, unknown>[]>;
//# sourceMappingURL=describeTable.d.ts.map