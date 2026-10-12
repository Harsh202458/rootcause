import { Pool } from 'pg';
import { AgentReport } from './loop';
import { OPS_DB_URL } from './config';

// Columns match the runs and steps tables in infra/postgres/init.sql.
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: OPS_DB_URL });
    // An idle connection dropped by the server must not crash the run.
    pool.on('error', () => undefined);
  }
  return pool;
}

export interface RunUpdate {
  status?: string;
  report?: AgentReport | null;
  total_steps?: number;
  total_tokens?: number;
  duration_ms?: number;
  error?: string;
}

export interface StepRecord {
  role: 'assistant' | 'tool';
  content?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  tokensIn?: number;
  tokensOut?: number;
  durationMs?: number;
  error?: string;
}

export async function insertRun(
  alert: string,
  provider: string,
  model: string,
  scenarioId?: string
): Promise<number> {
  const result = await getPool().query(
    'INSERT INTO runs (alert, provider, model, status, scenario_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [alert, provider, model, 'running', scenarioId ?? null]
  );
  return result.rows[0].id;
}

const RUN_COLUMNS: ReadonlyArray<keyof RunUpdate> = [
  'status',
  'report',
  'total_steps',
  'total_tokens',
  'duration_ms',
  'error'
];

export async function updateRun(runId: number, updates: RunUpdate): Promise<void> {
  const keys = RUN_COLUMNS.filter(key => updates[key] !== undefined);
  if (keys.length === 0) return;

  const setClauses = keys.map((key, idx) => `${key} = $${idx + 2}`);
  const values = keys.map(key => (key === 'report' ? JSON.stringify(updates.report) : updates[key]));

  await getPool().query(`UPDATE runs SET ${setClauses.join(', ')} WHERE id = $1`, [runId, ...values]);
}

export async function insertStep(runId: number, stepNumber: number, step: StepRecord): Promise<void> {
  await getPool().query(
    `INSERT INTO steps
       (run_id, step_number, role, content, tool_name, tool_args, tool_result, tokens_in, tokens_out, duration_ms, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      runId,
      stepNumber,
      step.role,
      step.content ?? null,
      step.toolName ?? null,
      step.toolArgs ? JSON.stringify(step.toolArgs) : null,
      step.toolResult ?? null,
      step.tokensIn ?? 0,
      step.tokensOut ?? 0,
      step.durationMs ?? null,
      step.error ?? null
    ]
  );
}

/** Stores how an eval scored a run, for the dashboard. */
export async function recordVerdict(
  runId: number,
  verdict: string,
  truth: { component: string; category: string }
): Promise<void> {
  await getPool().query(
    'UPDATE runs SET verdict = $2, truth_component = $3, truth_category = $4 WHERE id = $1',
    [runId, verdict, truth.component, truth.category]
  );
}

export async function closeTracing(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
