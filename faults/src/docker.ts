import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export const COMPOSE_FILE = path.resolve(__dirname, '../../infra/docker-compose.yml');

/** Finds the docker CLI. Docker Desktop's per-user install is not always on PATH. */
export function dockerBinary(): string {
  if (spawnSync('docker', ['--version'], { stdio: 'ignore' }).status === 0) return 'docker';

  const perUser = path.join(
    process.env.LOCALAPPDATA || '',
    'Programs',
    'DockerDesktop',
    'resources',
    'bin',
    'docker.exe'
  );
  if (fs.existsSync(perUser)) return perUser;
  throw new Error('docker was not found. Is Docker Desktop installed and running?');
}

export function compose(args: string[], env: NodeJS.ProcessEnv = {}): void {
  const result = spawnSync(dockerBinary(), ['compose', '-f', COMPOSE_FILE, ...args], {
    stdio: 'inherit',
    env: { ...process.env, ...env }
  });
  if (result.status !== 0) {
    throw new Error(`docker compose ${args.join(' ')} failed`);
  }
}
