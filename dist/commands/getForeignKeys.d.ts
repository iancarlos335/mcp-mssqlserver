import type sql from 'mssql';
export declare function getForeignKeys(pool: sql.ConnectionPool, client: typeof sql, table: string, schema?: string): Promise<Record<string, unknown>[]>;
//# sourceMappingURL=getForeignKeys.d.ts.map