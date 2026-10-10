"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recentDeploysTool = void 0;
const pg_1 = require("pg");
const truncate_1 = require("./truncate");
exports.recentDeploysTool = {
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
    async execute(args) {
        const hours = args.hours || 24;
        const pgUrl = process.env.OPS_DB_URL || 'postgres://postgres:postgres@localhost:5432/ops';
        const pool = new pg_1.Pool({ connectionString: pgUrl });
        try {
            let query = `SELECT * FROM deploy_events WHERE timestamp >= NOW() - INTERVAL '${hours} hours'`;
            const values = [];
            if (args.service) {
                query += ` AND service = $1`;
                values.push(args.service);
            }
            const res = await pool.query(query, values);
            const json = JSON.stringify(res.rows);
            const truncated = (0, truncate_1.truncate)(json);
            return {
                data: res.rows,
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
