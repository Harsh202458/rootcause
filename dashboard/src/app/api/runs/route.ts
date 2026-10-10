import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getStaticData } from '@/lib/static-data';

export async function GET(request: Request) {
  if (process.env.STATIC_EXPORT === 'true') {
    const data = getStaticData('runs.json');
    return NextResponse.json(data || []);
  }

  const { searchParams } = new URL(request.url);
  const provider = searchParams.get('provider');
  const verdict = searchParams.get('verdict');

  try {
    const pool = getDb();
    let query = 'SELECT * FROM runs';
    const params: any[] = [];
    
    const conditions = [];
    if (provider) {
      conditions.push(`provider = $${params.length + 1}`);
      params.push(provider);
    }
    if (verdict) {
      conditions.push(`verdict = $${params.length + 1}`);
      params.push(verdict);
    }
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    query += ' ORDER BY created_at DESC LIMIT 100';
    
    const result = await pool.query(query, params);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error in GET /api/runs:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
