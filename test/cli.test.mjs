import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createDbConfig } from '../dist/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(__dirname, '..', 'dist', 'cli.js');

describe('createDbConfig overrides', () => {
  test('host/database overrides win over env vars', () => {
    process.env.MSSQL_HOST = 'env-host';
    process.env.MSSQL_DATABASE = 'env-db';
    process.env.MSSQL_USER = 'u';
    process.env.MSSQL_PASSWORD = 'p';
    const config = createDbConfig('sql', { host: 'flag-host', database: 'flag-db' });
    assert.equal(config.server, 'flag-host');
    assert.equal(config.database, 'flag-db');
  });

  test('falls back to env vars when no overrides given', () => {
    process.env.MSSQL_HOST = 'env-host';
    process.env.MSSQL_DATABASE = 'env-db';
    process.env.MSSQL_USER = 'u';
    process.env.MSSQL_PASSWORD = 'p';
    const config = createDbConfig('sql', {});
    assert.equal(config.server, 'env-host');
    assert.equal(config.database, 'env-db');
  });

  test('rejects host override containing ODBC-injection characters', () => {
    process.env.MSSQL_DATABASE = 'env-db';
    assert.throws(
      () => createDbConfig('windows', { host: 'evil;TrustServerCertificate=yes' }),
      /Valor inválido para host\/database/
    );
  });

  test('rejects database override containing ODBC-injection characters', () => {
    process.env.MSSQL_HOST = 'env-host';
    assert.throws(
      () => createDbConfig('windows', { database: 'db;UID=sa;PWD=x' }),
      /Valor inválido para host\/database/
    );
  });
});

// Build a clean env with no MSSQL_* connection variables set, so commands
// that need a DB fail fast/predictably (no accidental real connection).
function cleanEnv(overrides = {}) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('MSSQL_')) {
      env[key] = value;
    }
  }
  return { ...env, ...overrides };
}

function runCli(args, envOverrides = {}) {
  return spawnSync('node', [CLI_PATH, ...args], {
    env: cleanEnv(envOverrides),
    encoding: 'utf8',
  });
}

describe('CLI JSON output/error contract', () => {
  test('--help exits 0 and lists all 7 subcommands', () => {
    const result = runCli(['--help']);
    assert.equal(result.status, 0);
    for (const name of [
      'list-tables',
      'describe-table',
      'list-databases',
      'get-table-indexes',
      'get-foreign-keys',
      'execute-query',
      'analyze-query-plan',
    ]) {
      assert.match(result.stdout, new RegExp(name), `expected --help output to mention ${name}`);
    }
  });

  test('--version exits 0 and prints the package version', () => {
    const result = runCli(['--version']);
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), '2.0.0');
  });

  test('list-tables with MSSQL_DATABASE unset exits 1 with JSON error on stderr', () => {
    const result = runCli(['list-tables']);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    const parsed = JSON.parse(result.stderr);
    assert.ok(typeof parsed.error === 'string' && parsed.error.length > 0);
  });

  test('list-tables --bogus-flag exits 1 with JSON error on stderr (commander error routed through printError)', () => {
    const result = runCli(['list-tables', '--bogus-flag']);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    const parsed = JSON.parse(result.stderr);
    assert.ok(typeof parsed.error === 'string' && parsed.error.length > 0);
  });

  test('describe-table with missing required argument exits 1 with JSON error on stderr', () => {
    const result = runCli(['describe-table']);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    const parsed = JSON.parse(result.stderr);
    assert.ok(typeof parsed.error === 'string' && parsed.error.length > 0);
  });

  test('unknown subcommand exits 1 with JSON error on stderr', () => {
    const result = runCli(['bogus-command']);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    const parsed = JSON.parse(result.stderr);
    assert.ok(typeof parsed.error === 'string' && parsed.error.length > 0);
  });

  test('execute-query with a blocked statement fails fast with the guard error, no DB required', () => {
    const result = runCli(['execute-query', 'DROP TABLE Orders']);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    const parsed = JSON.parse(result.stderr);
    assert.match(parsed.error, /perfil de execução/);
    assert.match(parsed.error, /DROP/);
  });

  test('execute-query with empty stdin and no argument exits 1 with a clear error', () => {
    const result = spawnSync('node', [CLI_PATH, 'execute-query'], {
      env: cleanEnv(),
      encoding: 'utf8',
      input: '',
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    const parsed = JSON.parse(result.stderr);
    assert.match(parsed.error, /No query provided/);
  });
});
