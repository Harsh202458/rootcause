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
    const body = await request.json();
    const reason = body.reason || 'No reason provided';
    
    const pool = getDb();
    
    await pool.query(
      "UPDATE fix_proposals SET status = 'rejected', decided_at = NOW(), decision_reason = $1 WHERE id = $2",
      [reason, params.id]
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`Error in POST /api/approvals/${params.id}/reject:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
