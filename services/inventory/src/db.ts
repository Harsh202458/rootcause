import pg from 'pg';
import promClient from 'prom-client';

const dbQueryDurationSeconds = new promClient.Histogram({
    name: 'db_query_duration_seconds',
    help: 'Duration of DB queries in seconds'
});

export const pool = new pg.Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    database: process.env.POSTGRES_DB || 'rootcause',
    min: parseInt(process.env.DB_POOL_MIN || '2'),
    max: parseInt(process.env.DB_POOL_MAX || '10')
});

export async function query(text: string, params?: any[]) {
    const end = dbQueryDurationSeconds.startTimer();
    try {
        return await pool.query(text, params);
    } finally {
        end();
    }
}
