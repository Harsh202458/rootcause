import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (process.env.STATIC_EXPORT === 'true') {
    return NextResponse.json({ error: 'Not supported in static export mode' }, { status: 400 });
  }

  try {
    const pool = getDb();
    await pool.query(
      "UPDATE fix_proposals SET status = 'approved', updated_at = NOW() WHERE id = $1",
      [params.id]
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`Error in POST /api/approvals/${params.id}/approve:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
