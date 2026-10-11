import { Client } from 'pg';
import { Tool, ToolResult } from './types';
import { readonlyDbUrl } from '../config';

const LEVELS = ['error', 'warn', 'info'];

export const queryLogsTool: Tool = {
  definition: {
    name: 'query_logs',
    description:
      'Searches service logs from the last N minutes (default 10). Identical messages are grouped, most frequent first, ' +
      'with a count, the first and last time seen, the versions that logged it, and one sample including any error and stack trace. ' +
      'Filter by service (gateway, orders, inventory, payments), level (error, warn, info) and a case-insensitive substring. ' +
      'Start with level "error".',
    parameters: {
      type: 'object',
      properties: {
        service: { type: 'string' },
        level: { type: 'string', enum: LEVELS },
        contains: { type: 'string', description: 'Substring to find in the message or error text.' },
        minutes: { type: 'number' },
        limit: { type: 'number', description: 'Maximum number of groups (default 10).' }
      }
    }
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const minutes = Math.min(Math.max(Number(args.minutes) || 10, 1), 120);
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);

    const where = ['ts >= NOW() - make_interval(mins => $1::int)'];
    const values: unknown[] = [minutes];
    if (args.service) {
      values.push(String(args.service));
      where.push(`service = $${values.length}`);
    }
    if (args.level) {
      if (!LEVELS.includes(String(args.level))) throw new Error(`level must be one of: ${LEVELS.join(', ')}`);
      values.push(String(args.level));
      where.push(`level = $${values.length}`);
    }
    if (args.contains) {
      values.push(`%${String(args.contains).replace(/[%_\\]/g, '\\$&')}%`);
      where.push(`(message ILIKE $${values.length} OR error ILIKE $${values.length})`);
    }
    values.push(limit);

    // Group on the message plus the first line of the error, so one failure
    // mode is one row however many requests hit it.
    const sql = `
      SELECT service, level, message,
             split_part(coalesce(error, ''), E'\\n', 1) AS error_summary,
             count(*)::int AS count,
             to_char(min(ts), 'HH24:MI:SS') AS first_seen,
             to_char(max(ts), 'HH24:MI:SS') AS last_seen,
             string_agg(DISTINCT version, ', ') AS versions,
             round(avg(duration_ms))::int AS avg_duration_ms,
             left((array_agg(error ORDER BY ts DESC))[1], 600) AS sample_error
      FROM logs
      WHERE ${where.join(' AND ')}
      GROUP BY 1, 2, 3, 4
      ORDER BY count(*) DESC
      LIMIT $${values.length}`;

    const client = new Client({ connectionString: readonlyDbUrl('ops'), statement_timeout: 5000 });
    try {
      await client.connect();
      const res = await client.query(sql, values);
      const now = await client.query("SELECT to_char(NOW(), 'HH24:MI:SS') AS now");
      return {
        data: { period: `${minutes}m`, now: now.rows[0].now, groups: res.rows },
        truncated: false
      };
    } catch (e: any) {
      return { data: { error: e.message }, truncated: false };
    } finally {
      await client.end().catch(() => undefined);
    }
  }
};
