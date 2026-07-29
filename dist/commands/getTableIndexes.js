export async function getTableIndexes(pool, client, table, schema = 'dbo') {
    const result = await pool
        .request()
        .input('schema', client.NVarChar, schema)
        .input('table', client.NVarChar, table).query(`
      SELECT
        i.name AS INDEX_NAME,
        i.type_desc AS INDEX_TYPE,
        i.is_unique AS IS_UNIQUE,
        i.is_primary_key AS IS_PRIMARY_KEY,
        STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS COLUMNS
      FROM sys.indexes i
      JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
      JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      JOIN sys.tables t ON i.object_id = t.object_id
      JOIN sys.schemas s ON t.schema_id = s.schema_id
      WHERE s.name = @schema AND t.name = @table
      GROUP BY i.name, i.type_desc, i.is_unique, i.is_primary_key
      ORDER BY i.is_primary_key DESC, i.name
    `);
    return result.recordset;
}
//# sourceMappingURL=getTableIndexes.js.map