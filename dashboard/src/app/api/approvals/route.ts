import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getStaticData } from '@/lib/static-data';
import { toProposal } from '@/lib/mappers';

export async function GET() {
  if (process.env.STATIC_EXPORT === 'true') {
    const data = getStaticData('approvals.json');
    return NextResponse.json(data || []);
  }

  try {
    const pool = getDb();
    const result = await pool.query('SELECT * FROM fix_proposals ORDER BY created_at DESC');
    return NextResponse.json(result.rows.map(toProposal));
  } catch (error) {
    console.error('Error in GET /api/approvals:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
