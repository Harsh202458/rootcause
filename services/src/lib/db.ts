import { lookup } from 'dns';
import { Pool, QueryResult } from 'pg';
import client from 'prom-client';
import { logEvent, SERVICE } from './kit';

const queryDuration = new client.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Database query duration, including time spent waiting for a connection',
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
});

const HOST = process.env.POSTGRES_HOST || 'localhost';
const MAX = parseInt(process.env.DB_POOL_MAX || '10', 10);
let established = 0;

/**
 * The pool reports every failure to get a connection as the same timeout.
 * Checking the host separately tells an unreachable database apart from a
 * pool that is simply full.
 */
function checkHost(): void {
  lookup(HOST, err => {
    if (err) logEvent('error', `database host "${HOST}" cannot be resolved`, err);
  });
}

export function createPool(): Pool {
  const pool = new Pool({
    host: HOST,
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'rootcause',
    password: process.env.POSTGRES_PASSWORD || 'rootcause_password',
    database: process.env.POSTGRES_DB || 'rootcause',
    max: MAX,
    connectionTimeoutMillis: 4000,
    statement_timeout: 3000,
    application_name: SERVICE
  });
  pool.on('error', () => undefined);
  // pool.totalCount also counts connections that are still being attempted,
  // so count the ones that really opened.
  pool.on('connect', () => { established++; });
  pool.on('remove', () => { established = Math.max(0, established - 1); });
  checkHost();

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
  } catch (err: any) {
    if (/timeout exceeded when trying to connect/.test(err?.message ?? '')) {
      checkHost();
      // Say what state the pool was in, so the log line explains itself.
      err.message =
        `timed out waiting for a database connection ` +
        `(host ${HOST}, ${established} of ${MAX} connections established)`;
    }
    throw err;
  } finally {
    end();
  }
}
