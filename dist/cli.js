#!/usr/bin/env node
import { Command, CommanderError } from 'commander';
import { parseProfile, assertQueryAllowed } from './guard.js';
import { connect } from './db.js';
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
    .version('2.0.0')
    .option('--host <host>', 'override MSSQL_HOST for this invocation')
    .option('--database <database>', 'override MSSQL_DATABASE for this invocation')
    .option('--pretty', 'pretty-print JSON output', false);
// Route commander's own parse/usage errors (unknown option, missing argument,
// unknown command, etc.) through the same JSON error contract as command
// actions, instead of letting commander print plain text and call
// process.exit() directly. --help/--version still print normally (they exit
// via CommanderError with exitCode 0, handled below).
program.exitOverride();
program.configureOutput({
    writeErr: () => {
        // Suppress commander's default plain-text error output; the thrown
        // CommanderError is turned into JSON error output in main() below.
    },
});
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
        throw new Error('No query provided. Pass it as an argument or via stdin.');
    }
    const chunks = [];
    for await (const chunk of process.stdin) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8').trim();
}
async function resolveQuery(queryArg) {
    const query = queryArg ?? (await readStdin());
    if (!query) {
        throw new Error('No query provided. Pass it as an argument or via stdin.');
    }
    return query;
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
        const query = await resolveQuery(queryArg);
        const profile = parseProfile(process.env.MSSQL_PROFILE);
        // Check the guard before connecting: a blocked query should fail fast
        // without paying for a DB connection, and a connection error must
        // never mask a clearer guard-rejection error.
        assertQueryAllowed(query, profile);
        const result = await withConnection((pool) => executeQuery(pool, query));
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
        const query = await resolveQuery(queryArg);
        const result = await analyzeQueryPlan(overridesFromOpts(), query, opts.includeRawPlan);
        printResult(result);
    }
    catch (error) {
        printError(error);
    }
});
async function main() {
    try {
        await program.parseAsync(process.argv);
    }
    catch (error) {
        if (error instanceof CommanderError) {
            // --help/--version (and other zero-exit-code paths) already printed
            // their output via the default writeOut; nothing else to do.
            if (error.exitCode === 0) {
                process.exitCode = 0;
                return;
            }
            printError(new Error(error.message.replace(/^error:\s*/, '')));
            process.exitCode = error.exitCode;
            return;
        }
        printError(error);
    }
}
void main();
//# sourceMappingURL=cli.js.map