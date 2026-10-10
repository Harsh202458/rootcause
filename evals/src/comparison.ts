import * as fs from 'node:fs';
import * as path from 'node:path';
import Table from 'cli-table3';
import type { EvalReport } from './report';

export function compareReports(resultsDir: string): void {
  if (!fs.existsSync(resultsDir)) {
    console.log(`Results directory ${resultsDir} does not exist.`);
    return;
  }
  const runs = fs.readdirSync(resultsDir).filter(f => {
    const stat = fs.statSync(path.join(resultsDir, f));
    return stat.isDirectory();
  });

  const reports: EvalReport[] = [];
  for (const run of runs) {
    const reportPath = path.join(resultsDir, run, 'report.json');
    if (fs.existsSync(reportPath)) {
      const data = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as EvalReport;
      reports.push(data);
    }
  }

  if (reports.length === 0) {
    console.log('No reports found to compare.');
    return;
  }

  reports.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const table = new Table({
    head: ['Run ID', 'Provider/Model', 'Accuracy', 'Partial', 'Median Steps', 'Median Tokens'],
  });

  for (const report of reports) {
    table.push([
      report.runId,
      `${report.config.provider} ${report.config.model ? `(${report.config.model})` : ''}`,
      `${(report.summary.accuracy * 100).toFixed(1)}%`,
      `${(report.summary.partialAccuracy * 100).toFixed(1)}%`,
      report.medianSteps.toString(),
      report.medianTokens.toString()
    ]);
  }

  console.log(table.toString());
}
