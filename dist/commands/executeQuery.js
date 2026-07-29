export async function executeQuery(pool, query) {
    const result = await pool.request().query(query);
    if (result.recordset && result.recordset.length > 0) {
        return { rows: result.recordset };
    }
    return { rowsAffected: result.rowsAffected?.[0] ?? 0 };
}
//# sourceMappingURL=executeQuery.js.map