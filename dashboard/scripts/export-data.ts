import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

async function exportData() {
  const publicDataDir = path.join(process.cwd(), 'public', 'data');
  if (!fs.existsSync(publicDataDir)) {
    fs.mkdirSync(publicDataDir, { recursive: true });
  }

  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'rootcause',
    password: process.env.DB_PASSWORD || 'rootcause_dev',
    database: process.env.OPS_DB || 'ops',
  });

  try {
    // 1. Export runs
    console.log('Exporting runs...');
    const runsResult = await pool.query('SELECT * FROM runs ORDER BY created_at DESC');
    fs.writeFileSync(
      path.join(publicDataDir, 'runs.json'), 
      JSON.stringify(runsResult.rows, null, 2)
    );

    // 2. Export individual run details + steps
    console.log('Exporting run details...');
    const runsDir = path.join(publicDataDir, 'data', 'runs');
    if (!fs.existsSync(runsDir)) {
      fs.mkdirSync(runsDir, { recursive: true });
    }

    for (const run of runsResult.rows) {
      const stepsResult = await pool.query(
        'SELECT * FROM steps WHERE run_id = $1 ORDER BY step_number ASC',
        [run.id]
      );
      run.steps = stepsResult.rows;
      
      fs.writeFileSync(
        path.join(runsDir, `${run.id}.json`), 
        JSON.stringify(run, null, 2)
      );
    }

    // 3. Export approvals
    console.log('Exporting approvals...');
    const approvalsResult = await pool.query('SELECT * FROM fix_proposals ORDER BY created_at DESC');
    fs.writeFileSync(
      path.join(publicDataDir, 'approvals.json'), 
      JSON.stringify(approvalsResult.rows, null, 2)
    );

    // 4. Export eval reports
    console.log('Exporting eval reports...');
    const reportsDir = path.join(process.cwd(), '..', 'docs', 'results');
    let evalReports = [];
    if (fs.existsSync(reportsDir)) {
      const files = fs.readdirSync(reportsDir).filter(f => f.endsWith('.json'));
      evalReports = files.map(file => {
        const data = fs.readFileSync(path.join(reportsDir, file), 'utf8');
        return JSON.parse(data);
      });
      evalReports.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }
    
    fs.writeFileSync(
      path.join(publicDataDir, 'eval_reports.json'), 
      JSON.stringify(evalReports, null, 2)
    );

    console.log('Static export data generated successfully!');
  } catch (error) {
    console.error('Error exporting data:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

exportData();
