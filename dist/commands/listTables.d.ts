import type sql from 'mssql';
export declare function listTables(pool: sql.ConnectionPool, client: typeof sql, schema?: string): Promise<Record<string, unknown>[]>;
//# sourceMappingURL=listTables.d.ts.map