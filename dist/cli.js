#!/usr/bin/env node
import { Command } from 'commander';
import { parseProfile } from './guard.js';
import { getAuthMode, connect } from './db.js';
import { listTables } from './commands/listTables.js';
import { describeTable } from './commands/describeTable.js';
import { listDatabases } from './commands/listDatabases.js';
import { getTableIndexes } from './commands/getTableIndexes.js';
import { getForeignKeys } from './commands/getForeignKeys.js';
import { executeQuery } from './commands/executeQuery.js';
import { analyzeQueryPlan } from './commands/analyzeQueryPlan.js';
const program = new Command();
program
    .name('mssql-cli')
    .description('CLI for querying, inspecting, and analyzing Microsoft SQL Server databases')
    .option('--host <host>', 'override MSSQL_HOST for this invocation')
    .option('--database <database>', 'override MSSQL_DATABASE for this invocation')
    .option('--pretty', 'pretty-print JSON output', false);
function overridesFromOpts() {
    const opts = program.opts();
    return { host: opts.host, database: opts.database };
}
function printResult(value) {
    const opts = program.opts();
    process.stdout.write(JSON.stringify(value, null, opts.pretty ? 2 : undefined) + '\n');
}
function printError(error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(JSON.stringify({ error: message }) + '\n');
    process.exitCode = 1;
}
async function withConnection(fn) {
    const { pool, client } = await connect(overridesFromOpts());
    try {
        return await fn(pool, client);
    }
    finally {
        await pool.close();
    }
}
async function readStdin() {
    if (process.stdin.isTTY) {
        throw new Error('Nenhuma query informada. Passe como argumento ou via stdin.');
    }
    const chunks = [];
    for await (const chunk of process.stdin) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8').trim();
}
program
    .command('list-tables')
    .description('List tables from INFORMATION_SCHEMA.TABLES')
    .option('--schema <schema>', 'filter by schema')
    .action(async (opts) => {
    try {
        const result = await withConnection((pool, client) => listTables(pool, client, opts.schema));
        printResult(result);
    }
    catch (error) {
        printError(error);
    }
});
program
    .command('describe-table <table>')
    .description('Return column metadata and primary key markers for a table')
    .option('--schema <schema>', 'table schema', 'dbo')
    .action(async (table, opts) => {
    try {
        const result = await withConnection((pool, client) => describeTable(pool, client, table, opts.schema));
        printResult(result);
    }
    catch (error) {
        printError(error);
    }
});
program
    .command('list-databases')
    .description('List all databases on the SQL Server instance')
    .action(async () => {
    try {
        const result = await withConnection((pool) => listDatabases(pool));
        printResult(result);
    }
    catch (error) {
        printError(error);
    }
});
program
    .command('get-table-indexes <table>')
    .description('List indexes for a table')
    .option('--schema <schema>', 'table schema', 'dbo')
    .action(async (table, opts) => {
    try {
        const result = await withConnection((pool, client) => getTableIndexes(pool, client, table, opts.schema));
        printResult(result);
    }
    catch (error) {
        printError(error);
    }
});
program
    .command('get-foreign-keys <table>')
    .description('List foreign keys for a table')
    .option('--schema <schema>', 'table schema', 'dbo')
    .action(async (table, opts) => {
    try {
        const result = await withConnection((pool, client) => getForeignKeys(pool, client, table, opts.schema));
        printResult(result);
    }
    catch (error) {
        printError(error);
    }
});
program
    .command('execute-query [query]')
    .description('Execute a SQL statement, gated by MSSQL_PROFILE (reader/dml/ddl)')
    .action(async (queryArg) => {
    try {
        const query = queryArg ?? (await readStdin());
        const profile = parseProfile(process.env.MSSQL_PROFILE);
        const result = await withConnection((pool) => executeQuery(pool, query, profile));
        printResult(result);
    }
    catch (error) {
        printError(error);
    }
});
program
    .command('analyze-query-plan [query]')
    .description('Analyze the estimated execution plan for a query without executing it')
    .option('--include-raw-plan', 'include the raw SHOWPLAN_XML in the output', false)
    .action(async (queryArg, opts) => {
    try {
        const query = queryArg ?? (await readStdin());
        const authMode = getAuthMode();
        const result = await analyzeQueryPlan(authMode, overridesFromOpts(), query, opts.includeRawPlan);
        printResult(result);
    }
    catch (error) {
        printError(error);
    }
});
program.parseAsync(process.argv).catch((error) => {
    printError(error);
});
//# sourceMappingURL=cli.js.map