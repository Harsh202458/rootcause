// The pages were written against slightly different names than the database
// uses. These map rows once, on the way out of the API.

export function toRun(row: any) {
  const report = row.report
    ? { ...row.report, confidence: Math.round((row.report.confidence ?? 0) * 100) }
    : null;
  return {
    ...row,
    id: String(row.id),
    alert_id: row.alert,
    final_report: report,
    total_steps: row.total_steps ?? 0,
    total_tokens: row.total_tokens ?? 0,
    duration_ms: row.duration_ms ?? 0,
    ground_truth: row.truth_component
      ? { component: row.truth_component, category: row.truth_category }
      : null
  };
}

export function toStep(row: any) {
  return {
    ...row,
    reasoning: row.role === 'assistant' ? row.content : null,
    tokens_used: (row.tokens_in || 0) + (row.tokens_out || 0),
    is_error: Boolean(row.error)
  };
}

export function toProposal(row: any) {
  return {
    ...row,
    run_id: String(row.run_id ?? '-'),
    updated_at: row.decided_at ?? row.created_at
  };
}

export function toEvalReport(report: any) {
  const tokens = (report.results ?? []).map((r: any) => r.tokens || 0);
  const avgTokens = tokens.length ? tokens.reduce((a: number, b: number) => a + b, 0) / tokens.length : 0;
  return { ...report, summary: { ...report.summary, avgTokens } };
}
