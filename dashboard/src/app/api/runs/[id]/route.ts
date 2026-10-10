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
    
    run.steps = stepsResult.rows;
    return NextResponse.json(run);
  } catch (error) {
    console.error(`Error in GET /api/runs/${params.id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
