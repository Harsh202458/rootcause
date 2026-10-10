import { Pool } from 'pg';
import { Tool, ToolResult } from './types';
import { truncate } from './truncate';

export const recentDeploysTool: Tool = {
  definition: {
    name: 'recent_deploys',
    description: 'Queries deploy_events table in ops database.',
    parameters: {
      type: 'object',
      properties: {
        service: { type: 'string' },
        hours: { type: 'number' }
      }
    }
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const hours = (args.hours as number) || 24;
    const pgUrl = process.env.OPS_DB_URL || 'postgres://postgres:postgres@localhost:5432/ops';
    const pool = new Pool({ connectionString: pgUrl });
    
    try {
      let query = `SELECT * FROM deploy_events WHERE timestamp >= NOW() - INTERVAL '${hours} hours'`;
      const values: any[] = [];
      if (args.service) {
        query += ` AND service = $1`;
        values.push(args.service);
      }
      const res = await pool.query(query, values);
      
      const json = JSON.stringify(res.rows);
      const truncated = truncate(json);
      return {
        data: res.rows,
        truncated: truncated.includes('[TRUNCATED')
      };
    } catch (e: any) {
      return {
        data: { error: e.message },
        truncated: false
      };
    } finally {
      await pool.end();
    }
  }
};
