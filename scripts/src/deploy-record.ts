import { Client } from 'pg';
import { program } from 'commander';

const DB_URL = process.env.OPS_DATABASE_URL || 'postgresql://rootcause:rootcause_password@localhost:5432/ops';

program
  .requiredOption('--service <name>', 'Service name')
  .requiredOption('--kind <type>', 'Kind of deployment (code, config, migration)')
  .option('--from <version>', 'From version')
  .option('--to <version>', 'To version')
  .option('--summary <text>', 'Summary of changes')
  .parse(process.argv);

const options = program.opts();

async function record() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  const query = `
    INSERT INTO deploy_events (service, kind, from_version, to_version, summary)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;
  const values = [options.service, options.kind, options.from, options.to, options.summary];

  const result = await client.query(query, values);
  console.log('Recorded deploy event:', result.rows[0]);
  
  await client.end();
}

record().catch(console.error);
