import type sql from 'mssql';
import { assertQueryAllowed, type Profile } from '../guard.js';

export interface ExecuteQueryResult {
  rows?: Record<string, unknown>[];
  rowsAffected?: number;
}

export async function executeQuery(
  pool: sql.ConnectionPool,
  query: string,
  profile: Profile
): Promise<ExecuteQueryResult> {
  assertQueryAllowed(query, profile);
  const result = await pool.request().query(query);
  if (result.recordset && result.recordset.length > 0) {
    return { rows: result.recordset };
  }
  return { rowsAffected: result.rowsAffected?.[0] ?? 0 };
}
