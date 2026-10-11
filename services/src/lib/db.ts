import { Pool, QueryResult } from 'pg';
import client from 'prom-client';
import { SERVICE } from './kit';

const queryDuration = new client.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Database query duration, including time spent waiting for a connection',
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
});

export function createPool(): Pool {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'rootcause',
    password: process.env.POSTGRES_PASSWORD || 'rootcause_password',
    database: process.env.POSTGRES_DB || 'rootcause',
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    connectionTimeoutMillis: 2000,
    statement_timeout: 3000,
    application_name: SERVICE
  });
  pool.on('error', () => undefined);

  new client.Gauge({ name: 'db_pool_size', help: 'Open connections', collect() { this.set(pool.totalCount); } });
  new client.Gauge({
    name: 'db_pool_in_use',
    help: 'Connections checked out',
    collect() { this.set(pool.totalCount - pool.idleCount); }
  });
  new client.Gauge({
    name: 'db_pool_waiting',
    help: 'Requests waiting for a connection',
    collect() { this.set(pool.waitingCount); }
  });

  return pool;
}

export async function query(pool: Pool, text: string, params?: unknown[]): Promise<QueryResult<any>> {
  const end = queryDuration.startTimer();
  try {
    return await pool.query(text, params);
  } finally {
    end();
  }
}
