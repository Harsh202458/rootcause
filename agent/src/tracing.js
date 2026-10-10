"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertRun = insertRun;
exports.updateRun = updateRun;
exports.insertStep = insertStep;
exports.getRun = getRun;
exports.getSteps = getSteps;
const pg_1 = require("pg");
const pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/ops',
});
async function insertRun(alert, provider, model) {
    const result = await pool.query('INSERT INTO runs (alert, provider, model, status) VALUES ($1, $2, $3, $4) RETURNING id', [alert, provider, model, 'running']);
    return result.rows[0].id;
}
async function updateRun(runId, updates) {
    const keys = Object.keys(updates);
    if (keys.length === 0)
        return;
    const setClauses = keys.map((key, idx) => `${key} = $${idx + 2}`);
    const values = keys.map(key => updates[key]);
    await pool.query(`UPDATE runs SET ${setClauses.join(', ')} WHERE id = $1`, [runId, ...values]);
}
async function insertStep(runId, stepNumber, data) {
    await pool.query('INSERT INTO steps (run_id, step_number, data) VALUES ($1, $2, $3)', [runId, stepNumber, JSON.stringify(data)]);
}
async function getRun(runId) {
    const result = await pool.query('SELECT * FROM runs WHERE id = $1', [runId]);
    if (result.rows.length === 0) {
        throw new Error(`Run ${runId} not found`);
    }
    return result.rows[0];
}
async function getSteps(runId) {
    const result = await pool.query('SELECT * FROM steps WHERE run_id = $1 ORDER BY step_number ASC', [runId]);
    return result.rows;
}
