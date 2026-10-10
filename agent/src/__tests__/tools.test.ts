import { runSqlReadonlyTool } from '../tools/run-sql-readonly';
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
