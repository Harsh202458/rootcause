import { execSync } from 'child_process';
import path from 'path';

const infraDir = path.resolve(__dirname, '../../infra');

console.log('Starting infrastructure...');
try {
  execSync('docker compose up -d --build', { cwd: infraDir, stdio: 'inherit' });
  console.log('Infrastructure started successfully.');
} catch (error) {
  console.error('Failed to start infrastructure:', error);
  process.exit(1);
}
