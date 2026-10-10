import { Pool } from 'pg';
import { Tool, ToolResult } from './types';
import { truncate } from './truncate';
import { v4 as uuid } from 'uuid';

export const proposeFixTool: Tool = {
  definition: {
    name: 'propose_fix',
    description: 'Inserts a pending row into fix_proposals table.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string' },
        target: { type: 'string' },
        reason: { type: 'string' }
      },
      required: ['action', 'target', 'reason']
    }
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const pgUrl = process.env.OPS_DB_URL || 'postgres://postgres:postgres@localhost:5432/ops';
    const pool = new Pool({ connectionString: pgUrl });
    
    try {
      const proposalId = uuid();
      await pool.query(
        `INSERT INTO fix_proposals (id, action, target, reason, status) VALUES ($1, $2, $3, $4, $5)`,
        [proposalId, args.action, args.target, args.reason, 'pending']
      );
      
      const result = { proposalId, status: 'pending' };
      const json = JSON.stringify(result);
      const truncated = truncate(json);
      return {
        data: result,
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
