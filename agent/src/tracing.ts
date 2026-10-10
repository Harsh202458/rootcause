import { Pool } from 'pg';
import { AgentReport } from './loop';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/ops',
});

export interface Run {
  id: number;
  alert: string;
  provider: string;
  model: string;
  status: string;
  report?: AgentReport | null;
  total_tokens: number;
  duration_ms: number;
  error?: string;
  created_at: Date;
}

export interface Step {
  id: number;
  run_id: number;
  step_number: number;
  data: any;
  created_at: Date;
}

export async function insertRun(alert: string, provider: string, model: string): Promise<number> {
  const result = await pool.query(
    'INSERT INTO runs (alert, provider, model, status) VALUES ($1, $2, $3, $4) RETURNING id',
    [alert, provider, model, 'running']
  );
  return result.rows[0].id;
}

export async function updateRun(runId: number, updates: Partial<Run>): Promise<void> {
  const keys = Object.keys(updates);
  if (keys.length === 0) return;
  
  const setClauses = keys.map((key, idx) => `${key} = $${idx + 2}`);
  const values = keys.map(key => updates[key as keyof Run]);
  
  await pool.query(
    `UPDATE runs SET ${setClauses.join(', ')} WHERE id = $1`,
    [runId, ...values]
  );
}

export async function insertStep(runId: number, stepNumber: number, data: any): Promise<void> {
  await pool.query(
    'INSERT INTO steps (run_id, step_number, data) VALUES ($1, $2, $3)',
    [runId, stepNumber, JSON.stringify(data)]
  );
}

export async function getRun(runId: number): Promise<Run> {
  const result = await pool.query('SELECT * FROM runs WHERE id = $1', [runId]);
  if (result.rows.length === 0) {
    throw new Error(`Run ${runId} not found`);
  }
  return result.rows[0];
}

export async function getSteps(runId: number): Promise<Step[]> {
  const result = await pool.query('SELECT * FROM steps WHERE run_id = $1 ORDER BY step_number ASC', [runId]);
  return result.rows;
}
