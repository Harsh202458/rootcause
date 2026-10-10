import { NextResponse } from 'next/server';
import { getStaticData } from '@/lib/static-data';
import fs from 'fs';
import path from 'path';

export async function GET() {
  if (process.env.STATIC_EXPORT === 'true') {
    const data = getStaticData('eval_reports.json');
    return NextResponse.json(data || []);
  }

  try {
    const reportsDir = path.join(process.cwd(), '..', 'docs', 'results');
    if (!fs.existsSync(reportsDir)) {
      return NextResponse.json([]);
    }

    const files = fs.readdirSync(reportsDir).filter(f => f.endsWith('.json'));
    const reports = files.map(file => {
      const data = fs.readFileSync(path.join(reportsDir, file), 'utf8');
      return JSON.parse(data);
    });
    
    reports.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return NextResponse.json(reports);
  } catch (error) {
    console.error('Error reading eval reports:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
