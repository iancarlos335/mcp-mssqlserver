import sql from 'mssql';

export type AuthMode = 'sql' | 'windows';
type SqlClient = typeof sql;

export interface ConnectionOverrides {
  host?: string;
  database?: string;
}

export interface DbContext {
  pool: sql.ConnectionPool;
  client: SqlClient;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória não definida: ${name}`);
  }
  return value;
}

function parsePort(value: string): number {
  const port = parseInt(value, 10);
  if (Number.isNaN(port)) {
    throw new Error(`Valor inválido para MSSQL_PORT: ${value}`);
  }
  return port;
}

export function getAuthMode(): AuthMode {
  const rawMode = (process.env.MSSQL_AUTH_MODE ?? 'sql').toLowerCase();
  if (rawMode === 'sql' || rawMode === 'windows') {
    return rawMode;
  }
  throw new Error(
    `Valor inválido para MSSQL_AUTH_MODE: ${rawMode}. Valores aceitos: sql, windows`
  );
}

async function getSqlClient(authMode: AuthMode): Promise<SqlClient> {
  if (authMode === 'windows') {
    const module = (await import('mssql/msnodesqlv8.js')) as { default?: SqlClient };
    return module.default ?? (module as unknown as SqlClient);
  }
  return sql;
}

export function createDbConfig(authMode: AuthMode, overrides: ConnectionOverrides = {}): sql.config {
  const encrypt = process.env.MSSQL_ENCRYPT === 'true';
  const trustServerCertificate = process.env.MSSQL_TRUST_SERVER_CERTIFICATE !== 'false';
  const host = overrides.host ?? process.env.MSSQL_HOST ?? 'localhost';
  const port = parsePort(process.env.MSSQL_PORT ?? '1433');
  const database = overrides.database ?? requireEnv('MSSQL_DATABASE');

  const config: sql.config = {
    server: host,
    port,
    database,
    options: {
      encrypt,
      trustServerCertificate,
    },
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };

  if (authMode === 'windows') {
    config.driver = 'msnodesqlv8';
    (config as sql.config & { connectionString?: string }).connectionString = `Driver={ODBC Driver 18 for SQL Server};Server=${host},${port};Database=${database};Trusted_Connection=yes;Encrypt=${
      encrypt ? 'yes' : 'no'
    };TrustServerCertificate=${trustServerCertificate ? 'yes' : 'no'};`;
  } else {
    config.user = requireEnv('MSSQL_USER');
    config.password = requireEnv('MSSQL_PASSWORD');
  }

  return config;
}

export async function connect(overrides: ConnectionOverrides = {}): Promise<DbContext> {
  const authMode = getAuthMode();
  const client = await getSqlClient(authMode);
  const config = createDbConfig(authMode, overrides);
  const pool = await new client.ConnectionPool(config).connect();
  return { pool, client };
}

export async function connectDedicated(overrides: ConnectionOverrides = {}): Promise<DbContext> {
  const authMode = getAuthMode();
  const client = await getSqlClient(authMode);
  const config = createDbConfig(authMode, overrides);
  const pool = await new client.ConnectionPool({
    ...config,
    pool: { max: 1, min: 0, idleTimeoutMillis: 30000 },
  }).connect();
  return { pool, client };
}
