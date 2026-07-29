import type sql from 'mssql';

export async function listDatabases(pool: sql.ConnectionPool): Promise<Record<string, unknown>[]> {
  const result = await pool
    .request()
    .query('SELECT name, create_date, state_desc FROM sys.databases ORDER BY name');
  return result.recordset;
}
