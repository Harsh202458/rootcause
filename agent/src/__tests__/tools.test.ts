import { runSqlReadonlyTool, validateSelect } from '../tools/run-sql-readonly';
import { queryMetricsTool } from '../tools/query-metrics';
import { submitReportTool } from '../tools/submit-report';
import { truncate } from '../tools/truncate';

describe('Agent Tools', () => {
  it('run_sql_readonly: rejects INSERT', async () => {
    await expect(
      runSqlReadonlyTool.execute({ database: 'ops', sql: 'INSERT INTO foo VALUES (1)' })
    ).rejects.toThrow(/Only SELECT queries are allowed/);
  });

  it('run_sql_readonly: rejects multi-statement', async () => {
    await expect(
      runSqlReadonlyTool.execute({ database: 'ops', sql: 'SELECT 1; SELECT 2;' })
    ).rejects.toThrow(/Only single statements are allowed/);
  });

  it.each([
    'UPDATE orders SET status = 1',
    'DELETE FROM orders',
    'DROP TABLE orders',
    'TRUNCATE orders',
    'EXPLAIN ANALYZE DELETE FROM orders',
    'COPY orders TO STDOUT'
  ])('run_sql_readonly: rejects non-SELECT statement %s', (sql) => {
    expect(() => validateSelect(sql)).toThrow(/Only SELECT queries are allowed/);
  });

  it('run_sql_readonly: rejects a write smuggled after a SELECT', () => {
    expect(() => validateSelect('SELECT 1; DROP TABLE orders')).toThrow(/Only single statements are allowed/);
  });

  it('run_sql_readonly: accepts a SELECT whose column names contain keywords', () => {
    expect(validateSelect('select updated_at, created_by from deploy_events;'))
      .toBe('select updated_at, created_by from deploy_events');
    expect(validateSelect('WITH x AS (SELECT 1) SELECT * FROM x')).toMatch(/^WITH/);
  });

  it('query_metrics: validates metric allowlist', async () => {
    await expect(
      queryMetricsTool.execute({ metric: 'unknown_metric' })
    ).rejects.toThrow(/Metric unknown_metric is not in the allowlist/);
  });

  it('submit_report: validates fields', async () => {
    await expect(
      submitReportTool.execute({
        component: 'unknown',
        category: 'bad_code_deploy',
        confidence: 1,
        evidence: [],
        explanation: 'test',
        suggestedFix: 'test'
      })
    ).rejects.toThrow(/Validation error/);
  });

  it('truncate: truncates over 4000 chars', () => {
    const longString = 'a'.repeat(5000);
    const truncated = truncate(longString);
    expect(truncated.length).toBe(4000 + `\n\n[TRUNCATED - showing first 4000 chars of 5000 total]`.length);
    expect(truncated).toContain('[TRUNCATED');
  });
});
