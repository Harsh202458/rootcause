import { Injector, unsupportedActions } from './injector';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

const scenariosDir = path.join(__dirname, '../scenarios');
const injector = new Injector();

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log('Usage: fault <inject|revert|list|verify-all> [scenario-id]');
    process.exit(1);
  }

  try {
    if (command === 'inject') {
      const id = args[1];
      if (!id) throw new Error('Missing scenario id');
      await injector.inject(id, scenariosDir);
    } else if (command === 'revert') {
      const id = args[1];
      if (!id) throw new Error('Missing scenario id');
      await injector.revert(id, scenariosDir);
    } else if (command === 'list') {
      const files = fs.readdirSync(scenariosDir).filter(f => f.endsWith('.yaml'));
      console.log('Available Scenarios:');
      for (const f of files) {
        const content = fs.readFileSync(path.join(scenariosDir, f), 'utf8');
        const s = yaml.parse(content);
        const missing = unsupportedActions(s);
        const status = missing.length === 0 ? 'ready' : `NOT IMPLEMENTED (${missing.join(', ')})`;
        console.log(`- ${s.id}: [${s.ground_truth.category}] ${status}`);
      }
    } else if (command === 'verify-all') {
      const files = fs.readdirSync(scenariosDir).filter(f => f.endsWith('.yaml'));
      for (const f of files) {
        const s = yaml.parse(fs.readFileSync(path.join(scenariosDir, f), 'utf8'));
        console.log(`Verifying ${s.id}...`);
        await injector.inject(s.id, scenariosDir);
        await new Promise(r => setTimeout(r, 1000));
        await injector.revert(s.id, scenariosDir);
      }
      console.log('All verified.');
    } else {
      console.log(`Unknown command: ${command}`);
      process.exit(1);
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

main();
