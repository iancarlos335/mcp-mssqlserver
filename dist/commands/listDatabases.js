export async function listDatabases(pool) {
    const result = await pool
        .request()
        .query('SELECT name, create_date, state_desc FROM sys.databases ORDER BY name');
    return result.recordset;
}
//# sourceMappingURL=listDatabases.js.map