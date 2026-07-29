---
name: mssql-cli
description: Query, inspect, and analyze Microsoft SQL Server databases via the mssql-cli CLI — table/schema discovery, guarded query execution, index/FK inspection, and execution-plan analysis. Use when the user asks about SQL Server data, schema, or query performance.
---

# mssql-cli

`mssql-cli` is a command-line tool for talking to a Microsoft SQL Server database. Every command prints JSON to stdout on success (exit code 0). On failure, it prints `{"error": "..."}` to stderr and exits with code 1.

## Connection

Connection settings come from environment variables (`MSSQL_HOST`, `MSSQL_PORT`, `MSSQL_DATABASE`, `MSSQL_AUTH_MODE`, `MSSQL_USER`, `MSSQL_PASSWORD`, `MSSQL_PROFILE`, ...) that must already be set in the shell before running `mssql-cli`. Two of them can be overridden per-invocation with flags, which is useful for comparing databases/environments without re-exporting env vars (especially handy with Windows Authentication):

- `--host <host>` overrides `MSSQL_HOST`
- `--database <database>` overrides `MSSQL_DATABASE`

Example — compare the same table across two environments:

```
mssql-cli --host prod-sql.internal --database Orders describe-table Invoices
mssql-cli --host staging-sql.internal --database Orders describe-table Invoices
```

## Commands

- `mssql-cli list-databases` — list all databases on the server.
- `mssql-cli list-tables [--schema <schema>]` — list tables, optionally filtered by schema.
- `mssql-cli describe-table <table> [--schema <schema>]` — columns, types, nullability, defaults, primary key markers (default schema: `dbo`).
- `mssql-cli get-table-indexes <table> [--schema <schema>]` — indexes, type, uniqueness, indexed columns.
- `mssql-cli get-foreign-keys <table> [--schema <schema>]` — foreign keys and their referenced targets.
- `mssql-cli execute-query <query>` — run a SQL statement and return rows or `{"rowsAffected": N}`. Gated by the active execution profile (see below). The query can also be piped via stdin for long statements.
- `mssql-cli analyze-query-plan <query> [--include-raw-plan]` — return the *estimated* execution plan (operators, costs, warnings, missing-index suggestions) **without executing the query**. Use this before running an expensive or unfamiliar query, or when the user asks why a query is slow.

Add `--pretty` to any command for indented JSON instead of compact JSON.

**Query starting with `-`** (e.g. a query that opens with a `-- comment`, which is common in LLM-generated SQL): passing it as a plain argument is misread as an unknown option. Use the `--` separator to stop option parsing (`mssql-cli execute-query -- "-- comment\nSELECT 1"`), or pipe it via stdin instead (`echo "-- comment\nSELECT 1" | mssql-cli execute-query`) — both work today.

## Execution profiles (`execute-query` only)

`execute-query` is gated by the `MSSQL_PROFILE` environment variable, cumulative:

- `reader` (default): `SELECT` and other read-only statements only.
- `dml`: `reader` + `INSERT`/`UPDATE`/`DELETE`/`MERGE` and transactions.
- `ddl`: everything, including `CREATE`/`ALTER`/`DROP`/`TRUNCATE` and `EXEC`.

If a statement isn't allowed under the active profile, `execute-query` exits 1 with a `{"error": "..."}` message naming the blocked keyword and the profile required to run it — this is expected guard behavior, not a bug. Don't retry the same statement; either it needs a different profile (tell the user) or rewrite the query to fit the current one. The catalog commands (`list-tables`, `describe-table`, `list-databases`, `get-table-indexes`, `get-foreign-keys`) always work regardless of profile — they only run fixed read-only queries.

## Workflow tips

- Before running an unfamiliar or potentially expensive `execute-query`, consider `analyze-query-plan` first, especially for queries touching large tables.
- Use `describe-table` and `get-foreign-keys` to understand a table's shape before writing a query against it.
- All output is JSON — parse it directly rather than asking the user to read raw SQL Server output.
