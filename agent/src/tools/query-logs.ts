import axios from 'axios';
import { Pool } from 'pg';
import { Tool, ToolResult } from './types';
import { truncate } from './truncate';
import { readonlyDbUrl } from '../config';

export const queryLogsTool: Tool = {
  definition: {
    name: 'query_logs',
    description: 'Queries Loki API for logs or falls back to postgres.',
    parameters: {
      type: 'object',
      properties: {
        service: { type: 'string' },
        level: { type: 'string', enum: ['error', 'warn', 'info'] },
        contains: { type: 'string' },
        minutes: { type: 'number' },
        limit: { type: 'number' }
      }
    }
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const minutes = (args.minutes as number) || 30;
    const limit = (args.limit as number) || 100;
    const lokiUrl = process.env.LOKI_URL || 'http://localhost:3100';
    
    let logs = [];
    try {
      // Stub loki call, if it fails, fallback to pg
      const response = await axios.get(`${lokiUrl}/loki/api/v1/query_range`);
      logs = response.data; // simplify parsing for now
    } catch (e) {
      // Fallback
      const pgUrl = readonlyDbUrl('ops');
      const pool = new Pool({ connectionString: pgUrl });
      try {
        const res = await pool.query(`SELECT * FROM logs LIMIT $1`, [limit]);
        logs = res.rows;
      } catch (err: any) {
        logs = [{ error: err.message }];
      } finally {
        await pool.end();
      }
    }
    
    const result = {
      totalMatched: logs.length,
      groups: [{ count: logs.length, sample: logs[0] || {} }]
    };
    
    const json = JSON.stringify(result);
    const truncated = truncate(json);
    return {
      data: result,
      truncated: truncated.includes('[TRUNCATED')
    };
  }
};
