import { Pool } from 'pg';

let pool: Pool | null = null;

export function getDb() {
  if (!pool) {
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      user: process.env.DB_USER || 'rootcause',
      password: process.env.DB_PASSWORD || 'rootcause_password',
      database: process.env.OPS_DB || 'ops',
    });
  }
  return pool;
}
