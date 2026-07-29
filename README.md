# mcp-mssqlserver

[![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](package.json)

A command-line tool for Microsoft SQL Server: query execution, schema discovery, and execution-plan analysis, installable globally as `mssql-cli` — with a bundled Skill so coding agents (Claude Code, Codex, and others) can use it directly.

## Features

- Query execution (`SELECT`, `INSERT`, `UPDATE`, `DELETE`), gated by execution profiles
- Database discovery and schema introspection
- Table metadata inspection (columns, types, nullability, defaults, PK)
- Index and foreign key discovery
- Estimated execution plan analysis (operators, costs, warnings, missing index suggestions) without executing the query
- Environment-driven configuration, with per-invocation `--host`/`--database` overrides
- A ready-to-install agent Skill (`skill/mssql-cli/`) so AI coding assistants can drive the CLI directly

## Requirements

- Node.js 18+
- Access to a Microsoft SQL Server instance
- Network connectivity from the machine running `mssql-cli` to SQL Server (`host:port`)

## Install

Install globally from GitHub:

```bash
npm install -g github:iancarlos335/mcp-mssqlserver
```

Or from a local clone:

```bash
git clone https://github.com/iancarlos335/mcp-mssqlserver
cd mcp-mssqlserver
npm install -g .
```

Either method builds the TypeScript sources and puts the `mssql-cli` binary on your `PATH`.

Verify the install:

```bash
mssql-cli --help
```

## Configuration

`mssql-cli` reads connection settings from environment variables. Set them in your shell (or a `.env` file loaded by your shell/process manager) before running any command:

| Variable | Required | Default | Description |
|---|---|---|---|
| `MSSQL_HOST` | No | `localhost` | SQL Server host or IP |
| `MSSQL_PORT` | No | `1433` | SQL Server TCP port |
| `MSSQL_DATABASE` | Yes | — | Default database |
| `MSSQL_AUTH_MODE` | No | `sql` | Authentication mode: `sql` or `windows` |
| `MSSQL_PROFILE` | No | `reader` | Execution guard profile: `reader` (read-only), `dml` (+ writes), `ddl` (everything) |
| `MSSQL_USER` | Yes\* | — | SQL login user (required only in `sql`) |
| `MSSQL_PASSWORD` | Yes\* | — | SQL login password (required only in `sql`) |
| `MSSQL_ENCRYPT` | No | `false` | Enables encrypted connection |
| `MSSQL_TRUST_SERVER_CERTIFICATE` | No | `true` | Trusts server certificate when encryption is enabled |

\* Required when `MSSQL_AUTH_MODE=sql`.

### Per-invocation overrides

Two settings can be overridden per command with flags, without touching your exported environment variables — handy for comparing databases or environments in the same shell session (especially with Windows Authentication, where switching `MSSQL_USER`/`MSSQL_PASSWORD` isn't relevant):

| Flag | Overrides | Example |
|---|---|---|
| `--host <host>` | `MSSQL_HOST` | `mssql-cli --host staging-sql.internal list-tables` |
| `--database <database>` | `MSSQL_DATABASE` | `mssql-cli --database Orders describe-table Invoices` |

Both flags can be combined, and both are global — they must be passed before the subcommand:

```bash
mssql-cli --host prod-sql.internal --database Orders describe-table Invoices
mssql-cli --host staging-sql.internal --database Orders describe-table Invoices
```

## Commands

Every command prints JSON to stdout on success (exit code 0). On failure, it prints `{"error": "..."}` to stderr and exits with code 1. Add `--pretty` to any command for indented JSON instead of compact JSON.

| Command | Description |
|---|---|
| `list-databases` | List all databases on the SQL Server instance |
| `list-tables [--schema <schema>]` | List tables from `INFORMATION_SCHEMA.TABLES`, optionally filtered by schema |
| `describe-table <table> [--schema <schema>]` | Column metadata and primary key markers for a table (default schema: `dbo`) |
| `get-table-indexes <table> [--schema <schema>]` | Indexes, type, uniqueness, and indexed columns for a table (default schema: `dbo`) |
| `get-foreign-keys <table> [--schema <schema>]` | Foreign keys and their referenced targets for a table (default schema: `dbo`) |
| `execute-query <query>` | Execute a SQL statement and return rows or `{"rowsAffected": N}`, gated by `MSSQL_PROFILE` (see Execution Profiles below). The query can also be piped via stdin instead of passed as an argument. |
| `analyze-query-plan <query> [--include-raw-plan]` | Return the *estimated* execution plan (operators, costs, warnings, missing-index suggestions) **without executing the query**. The query can also be piped via stdin. |

### Examples

```bash
mssql-cli list-databases

mssql-cli list-tables --schema dbo

mssql-cli describe-table Orders --schema dbo

mssql-cli get-table-indexes Orders

mssql-cli get-foreign-keys Orders

mssql-cli execute-query "SELECT TOP 10 * FROM Orders"

mssql-cli analyze-query-plan "SELECT * FROM Orders WHERE CustomerId = 42" --include-raw-plan
```

## Execution Profiles

The `MSSQL_PROFILE` environment variable controls which SQL statements `execute-query` may run. Profiles are cumulative:

| Profile | Allows |
|---|---|
| `reader` (default) | `SELECT`, CTEs, `DECLARE`/`SET`, flow control (`IF`, `WHILE`, `BEGIN...END`), cursors |
| `dml` | Everything in `reader`, plus `INSERT`, `UPDATE`, `DELETE`, `MERGE` and transactions (`BEGIN TRAN`, `COMMIT`, `ROLLBACK`) |
| `ddl` | Everything — `CREATE`/`ALTER`/`DROP`/`TRUNCATE`, `EXEC`, `GRANT`, and any other statement |

Enforcement uses a strict allowlist: statements the classifier does not recognize are **denied** below `ddl`, with an error naming the active profile and the blocked statement. Notable classifications:

- `SELECT ... INTO` requires `ddl` (it creates a table).
- `EXEC`/`sp_executesql` and `OPENROWSET`/`OPENQUERY`/`OPENDATASOURCE` require `ddl` — dynamic and pass-through SQL cannot be classified.
- Transactions require `dml`.
- Keywords inside strings, comments, or `[bracketed identifiers]` are ignored correctly.

The catalog commands (`list-tables`, `describe-table`, `list-databases`, `get-table-indexes`, `get-foreign-keys`) run fixed read-only queries and work in every profile, regardless of `MSSQL_PROFILE`.

## Agent Skill installation

This repo ships an agent-facing [Skill](skill/mssql-cli/SKILL.md) that teaches AI coding assistants how to use `mssql-cli` — the command table, execution-profile behavior, and workflow guidance (e.g. run `analyze-query-plan` before an expensive or unfamiliar `execute-query`). Installing it lets tools like Claude Code or Codex call `mssql-cli` correctly without you having to explain it in every conversation.

The install scripts copy `skill/mssql-cli/` into whichever of these provider folders you target:

| Target | Destination |
|---|---|
| `claude` | `~/.claude/skills/mssql-cli` |
| `codex` | `$CODEX_HOME/skills/mssql-cli` (default `~/.codex/skills/mssql-cli`) |
| `antigravity` | `~/.gemini/config/skills/mssql-cli` |
| `agentskills` | `~/.agents/skills/mssql-cli` (the [agentskills.io](https://agentskills.io) convention) |

### macOS / Linux (`install-skill.sh`)

```bash
./scripts/install-skill.sh                    # installs to all 4 providers
./scripts/install-skill.sh --target=claude     # installs to a single provider
./scripts/install-skill.sh --uninstall         # removes from all 4 providers
./scripts/install-skill.sh --target=claude --uninstall
```

### Windows (`install-skill.ps1`)

```powershell
.\scripts\install-skill.ps1                    # installs to all 4 providers
.\scripts\install-skill.ps1 -Target claude      # installs to a single provider
.\scripts\install-skill.ps1 -Uninstall          # removes from all 4 providers
.\scripts\install-skill.ps1 -Target claude -Uninstall
```

`-Target` accepts `all` (default), `claude`, `codex`, `antigravity`, or `agentskills`.

## Local Development

```bash
git clone https://github.com/iancarlos335/mcp-mssqlserver
cd mcp-mssqlserver
npm install
npm run build
```

Run the CLI from the compiled output:

```bash
node dist/cli.js --help
```

## Build and Commit Workflow

This repository uses a Husky `pre-commit` hook to:
1. build TypeScript (`npm run build`)
2. stage generated artifacts (`git add dist`)

Manual fallback:

```bash
npm run build
git add dist
```

## Security Notes

- Never commit real credentials or `.env` files.
- Prefer least-privilege SQL users for production use.
- Keep `MSSQL_PROFILE=reader` unless writes are required. The profile guard is defense-in-depth, not a substitute for database-level permissions.
- For public or untrusted networks, enable encryption (`MSSQL_ENCRYPT=true`) and configure certificates appropriately.

## Windows Authentication (Integrated Security)

To use Windows Authentication with Integrated Security (process account), configure:

```bash
MSSQL_AUTH_MODE=windows
MSSQL_HOST=sqlserver.company.local
MSSQL_PORT=1433
MSSQL_DATABASE=master
```
