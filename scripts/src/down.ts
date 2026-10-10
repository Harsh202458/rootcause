import { execSync } from 'child_process';
import path from 'path';

const infraDir = path.resolve(__dirname, '../../infra');

console.log('Stopping infrastructure...');
try {
  execSync('docker compose down', { cwd: infraDir, stdio: 'inherit' });
  console.log('Infrastructure stopped successfully.');
} catch (error) {
  console.error('Failed to stop infrastructure:', error);
  process.exit(1);
}
