import type sql from 'mssql';

export async function getForeignKeys(
  pool: sql.ConnectionPool,
  client: typeof sql,
  table: string,
  schema = 'dbo'
): Promise<Record<string, unknown>[]> {
  const result = await pool
    .request()
    .input('schema', client.NVarChar, schema)
    .input('table', client.NVarChar, table).query(`
      SELECT
        fk.name AS FK_NAME,
        COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS COLUMN_NAME,
        OBJECT_SCHEMA_NAME(fkc.referenced_object_id) AS REFERENCED_SCHEMA,
        OBJECT_NAME(fkc.referenced_object_id) AS REFERENCED_TABLE,
        COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS REFERENCED_COLUMN,
        fk.delete_referential_action_desc AS ON_DELETE,
        fk.update_referential_action_desc AS ON_UPDATE
      FROM sys.foreign_keys fk
      JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
      JOIN sys.tables t ON fk.parent_object_id = t.object_id
      JOIN sys.schemas s ON t.schema_id = s.schema_id
      WHERE s.name = @schema AND t.name = @table
      ORDER BY fk.name
    `);
  return result.recordset;
}
