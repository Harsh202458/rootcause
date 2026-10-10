"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryLogsTool = void 0;
const axios_1 = __importDefault(require("axios"));
const pg_1 = require("pg");
const truncate_1 = require("./truncate");
exports.queryLogsTool = {
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
    async execute(args) {
        const minutes = args.minutes || 30;
        const limit = args.limit || 100;
        const lokiUrl = process.env.LOKI_URL || 'http://localhost:3100';
        let logs = [];
        try {
            // Stub loki call, if it fails, fallback to pg
            const response = await axios_1.default.get(`${lokiUrl}/loki/api/v1/query_range`);
            logs = response.data; // simplify parsing for now
        }
        catch (e) {
            // Fallback
            const pgUrl = process.env.OPS_DB_URL || 'postgres://postgres:postgres@localhost:5432/ops';
            const pool = new pg_1.Pool({ connectionString: pgUrl });
            try {
                const res = await pool.query(`SELECT * FROM logs LIMIT $1`, [limit]);
                logs = res.rows;
            }
            catch (err) {
                logs = [{ error: err.message }];
            }
            finally {
                await pool.end();
            }
        }
        const result = {
            totalMatched: logs.length,
            groups: [{ count: logs.length, sample: logs[0] || {} }]
        };
        const json = JSON.stringify(result);
        const truncated = (0, truncate_1.truncate)(json);
        return {
            data: result,
            truncated: truncated.includes('[TRUNCATED')
        };
    }
};
