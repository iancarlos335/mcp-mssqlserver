export async function listTables(pool, client, schema) {
    const request = pool.request();
    let query = `
    SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
    FROM INFORMATION_SCHEMA.TABLES
  `;
    if (schema) {
        request.input('schema', client.NVarChar, schema);
        query += ' WHERE TABLE_SCHEMA = @schema';
    }
    query += ' ORDER BY TABLE_SCHEMA, TABLE_NAME';
    const result = await request.query(query);
    return result.recordset;
}
//# sourceMappingURL=listTables.js.map