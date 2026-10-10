"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.proposeFixTool = void 0;
const pg_1 = require("pg");
const truncate_1 = require("./truncate");
const uuid_1 = require("uuid");
exports.proposeFixTool = {
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
    async execute(args) {
        const pgUrl = process.env.OPS_DB_URL || 'postgres://postgres:postgres@localhost:5432/ops';
        const pool = new pg_1.Pool({ connectionString: pgUrl });
        try {
            const proposalId = (0, uuid_1.v4)();
            await pool.query(`INSERT INTO fix_proposals (id, action, target, reason, status) VALUES ($1, $2, $3, $4, $5)`, [proposalId, args.action, args.target, args.reason, 'pending']);
            const result = { proposalId, status: 'pending' };
            const json = JSON.stringify(result);
            const truncated = (0, truncate_1.truncate)(json);
            return {
                data: result,
                truncated: truncated.includes('[TRUNCATED')
            };
        }
        catch (e) {
            return {
                data: { error: e.message },
                truncated: false
            };
        }
        finally {
            await pool.end();
        }
    }
};
