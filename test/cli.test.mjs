import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createDbConfig } from '../dist/db.js';

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
});
