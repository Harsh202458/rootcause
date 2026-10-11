import { NextResponse } from 'next/server';
import { getStaticData } from '@/lib/static-data';
import { toEvalReport } from '@/lib/mappers';
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

    // One folder per eval run, each with a report.json.
    const reports = fs
      .readdirSync(reportsDir)
      .map(run => path.join(reportsDir, run, 'report.json'))
      .filter(file => fs.existsSync(file))
      .map(file => toEvalReport(JSON.parse(fs.readFileSync(file, 'utf8'))));

    reports.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return NextResponse.json(reports);
  } catch (error) {
    console.error('Error reading eval reports:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
