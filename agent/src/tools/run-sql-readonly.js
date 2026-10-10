"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSqlReadonlyTool = void 0;
const pg_1 = require("pg");
const truncate_1 = require("./truncate");
exports.runSqlReadonlyTool = {
    definition: {
        name: 'run_sql_readonly',
        description: 'Run readonly SQL query.',
        parameters: {
            type: 'object',
            properties: {
                database: { type: 'string', enum: ['rootcause', 'ops'] },
                sql: { type: 'string' }
            },
            required: ['database', 'sql']
        }
    },
    async execute(args) {
        const db = args.database;
        const sql = args.sql;
        const upperSql = sql.toUpperCase();
        if (upperSql.includes('INSERT ') || upperSql.includes('UPDATE ') || upperSql.includes('DELETE ') ||
            upperSql.includes('DROP ') || upperSql.includes('ALTER ') || upperSql.includes('CREATE ') ||
            upperSql.includes('TRUNCATE ') || upperSql.includes('GRANT ') || upperSql.includes('REVOKE ')) {
            throw new Error("Only SELECT queries are allowed.");
        }
        // Check for multi-statements
        if (sql.split(';').filter(s => s.trim().length > 0).length > 1) {
            throw new Error("Only single statements are allowed.");
        }
        let pgUrl = `postgres://agent_readonly:agent_readonly@localhost:5432/${db}`;
        if (db === 'ops' && process.env.OPS_DB_URL) {
            pgUrl = process.env.OPS_DB_URL.replace(/postgres:\/\/[^:]+:[^@]+@/, 'postgres://agent_readonly:agent_readonly@');
        }
        const pool = new pg_1.Pool({ connectionString: pgUrl });
        try {
            await pool.query('SET statement_timeout = 3000');
            // Limit to 50 rows, though in reality you'd parse or wrap the query
            const res = await pool.query(sql);
            const rows = res.rows.slice(0, 50);
            const result = {
                columns: res.fields.map(f => f.name),
                rows,
                rowCount: res.rowCount,
                truncatedRows: res.rows.length > 50
            };
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
