import { Client } from 'pg';
import { Tool, ToolResult } from './types';
import { readonlyDbUrl, AgentDatabase } from '../config';

const MAX_ROWS = 50;
const STATEMENT_TIMEOUT_MS = 3000;
const DATABASES: ReadonlyArray<AgentDatabase> = ['rootcause', 'ops'];

/**
 * Returns the single SELECT statement to run, or throws.
 * This is only the first line of defence: the query also runs as a SELECT-only
 * role inside a READ ONLY transaction, which is what actually stops writes
 * (including data-modifying CTEs such as WITH x AS (DELETE ...)).
 */
export function validateSelect(sql: string): string {
  const statement = sql.trim().replace(/;\s*$/, '');
  if (statement.includes(';')) {
    throw new Error('Only single statements are allowed.');
  }
  if (!/^(select|with)\b/i.test(statement)) {
    throw new Error('Only SELECT queries are allowed.');
  }
  return statement;
}

export const runSqlReadonlyTool: Tool = {
  definition: {
    name: 'run_sql_readonly',
    description:
      'Run one read-only SELECT against the application database ("rootcause") or the ops database ("ops", deploy history only). ' +
      'Returns at most 50 rows and times out after 3 seconds. Useful system views: pg_stat_activity, pg_locks, pg_indexes, information_schema.columns.',
    parameters: {
      type: 'object',
      properties: {
        database: { type: 'string', enum: ['rootcause', 'ops'] },
        sql: { type: 'string', description: 'A single SELECT statement.' }
      },
      required: ['database', 'sql']
    }
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const database = args.database as AgentDatabase;
    if (!DATABASES.includes(database)) {
      throw new Error(`Unknown database: ${String(args.database)}`);
    }
    const statement = validateSelect(String(args.sql ?? ''));

    const client = new Client({ connectionString: readonlyDbUrl(database) });
    try {
      await client.connect();
      await client.query('BEGIN TRANSACTION READ ONLY');
      await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      // Fetch one extra row so we can tell the model when results were cut off.
      const res = await client.query(`SELECT * FROM (${statement}) AS q LIMIT ${MAX_ROWS + 1}`);

      const truncated = res.rows.length > MAX_ROWS;
      return {
        data: {
          columns: res.fields.map(f => f.name),
          rows: res.rows.slice(0, MAX_ROWS),
          truncatedRows: truncated
        },
        truncated
      };
    } catch (e: any) {
      return { data: { error: e.message }, truncated: false };
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      await client.end().catch(() => undefined);
    }
  }
};
