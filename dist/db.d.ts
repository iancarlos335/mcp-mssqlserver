import sql from 'mssql';
export type AuthMode = 'sql' | 'windows';
type SqlClient = typeof sql;
export interface ConnectionOverrides {
    host?: string;
    database?: string;
}
export interface DbContext {
    pool: sql.ConnectionPool;
    client: SqlClient;
}
export declare function getAuthMode(): AuthMode;
export declare function createDbConfig(authMode: AuthMode, overrides?: ConnectionOverrides): sql.config;
export declare function connect(overrides?: ConnectionOverrides): Promise<DbContext>;
export declare function connectDedicated(overrides?: ConnectionOverrides): Promise<DbContext>;
export {};
//# sourceMappingURL=db.d.ts.map