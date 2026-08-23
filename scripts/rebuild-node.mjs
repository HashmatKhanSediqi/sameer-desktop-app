import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');

console.log('[rebuild:node] Rebuilding better-sqlite3 and bcrypt for Node.js');

const npmExecPath = process.env.npm_execpath;
const command = npmExecPath ? process.execPath : 'npm';
const args = npmExecPath
  ? [npmExecPath, 'rebuild', 'better-sqlite3', 'bcrypt']
  : ['rebuild', 'better-sqlite3', 'bcrypt'];

const result = spawnSync(command, args, {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: false,
  env: process.env,
  windowsHide: true,
});

if (result.error) {
  console.error('[rebuild:node] Failed', result.error);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`[rebuild:node] Failed (exit code ${result.status ?? 'unknown'})`);
  process.exit(result.status ?? 1);
}

console.log('[rebuild:node] Native modules rebuilt for Node.js');
