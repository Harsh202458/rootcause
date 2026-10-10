import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getStaticData } from '@/lib/static-data';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (process.env.STATIC_EXPORT === 'true') {
    const data = getStaticData(`runs/${params.id}.json`);
    if (data) return NextResponse.json(data);
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  try {
    const pool = getDb();
    const runResult = await pool.query('SELECT * FROM runs WHERE id = $1', [params.id]);
    
    if (runResult.rows.length === 0) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }
    
    const run = runResult.rows[0];
    
    const stepsResult = await pool.query(
      'SELECT * FROM steps WHERE run_id = $1 ORDER BY step_number ASC',
      [params.id]
    );
    
    // Map database columns to the names the run page and Timeline read.
    run.final_report = run.report;
    run.alert_id = run.alert;
    run.steps = stepsResult.rows.map(step => ({
      ...step,
      reasoning: step.role === 'assistant' ? step.content : null,
      tokens_used: (step.tokens_in || 0) + (step.tokens_out || 0),
      is_error: Boolean(step.error)
    }));
    return NextResponse.json(run);
  } catch (error) {
    console.error(`Error in GET /api/runs/${params.id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
