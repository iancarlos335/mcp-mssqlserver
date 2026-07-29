import type sql from 'mssql';
import { type Profile } from '../guard.js';
export interface ExecuteQueryResult {
    rows?: Record<string, unknown>[];
    rowsAffected?: number;
}
export declare function executeQuery(pool: sql.ConnectionPool, query: string, profile: Profile): Promise<ExecuteQueryResult>;
//# sourceMappingURL=executeQuery.d.ts.map