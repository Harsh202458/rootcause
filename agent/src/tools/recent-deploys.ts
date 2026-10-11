import { Client } from 'pg';
import { Tool, ToolResult } from './types';
import { readonlyDbUrl } from '../config';

export const recentDeploysTool: Tool = {
  definition: {
    name: 'recent_deploys',
    description:
      'Lists code, config and migration deploys from the last N hours (default 24), newest first, with how many minutes ago each happened (times are UTC). Optionally filter by service.',
    parameters: {
      type: 'object',
      properties: {
        service: { type: 'string' },
        hours: { type: 'number' }
      }
    }
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const hours = Math.min(Math.max(Number(args.hours) || 24, 1), 24 * 14);
    const client = new Client({ connectionString: readonlyDbUrl('ops') });

    try {
      await client.connect();
      const values: unknown[] = [hours];
      let query =
        `SELECT to_char(timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS deployed_at, ` +
        'round(extract(epoch FROM NOW() - timestamp) / 60)::int AS minutes_ago, ' +
        'service, kind, from_version, to_version, summary, diff_summary ' +
        'FROM deploy_events WHERE timestamp >= NOW() - make_interval(hours => $1::int)';
      if (args.service) {
        query += ' AND service = $2';
        values.push(String(args.service));
      }
      query += ' ORDER BY timestamp DESC LIMIT 50';
      const res = await client.query(query, values);
      return { data: res.rows, truncated: false };
    } catch (e: any) {
      return { data: { error: e.message }, truncated: false };
    } finally {
      await client.end().catch(() => undefined);
    }
  }
};
