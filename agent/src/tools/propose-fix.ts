import { Client } from 'pg';
import { Tool, ToolResult } from './types';
import { OPS_DB_URL } from '../config';

// The only write the agent can make: a pending proposal for a human to approve.
// Nothing is executed here.
export const proposeFixTool: Tool = {
  definition: {
    name: 'propose_fix',
    description:
      'Propose a remediation for a human to approve. This records the proposal only; it does not change the system.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'What to do, e.g. "rollback", "restart", "recreate index".' },
        target: { type: 'string', description: 'The service or database object to act on.' },
        reason: { type: 'string' }
      },
      required: ['action', 'target', 'reason']
    }
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const client = new Client({ connectionString: OPS_DB_URL });

    try {
      await client.connect();
      const res = await client.query(
        `INSERT INTO fix_proposals (action, target, reason, status) VALUES ($1, $2, $3, 'pending') RETURNING id`,
        [String(args.action), String(args.target), String(args.reason)]
      );
      return { data: { proposalId: res.rows[0].id, status: 'pending' }, truncated: false };
    } catch (e: any) {
      return { data: { error: e.message }, truncated: false };
    } finally {
      await client.end().catch(() => undefined);
    }
  }
};
