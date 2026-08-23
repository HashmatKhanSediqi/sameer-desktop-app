import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');

function runNodeScript(scriptPath, label) {
  console.log(`[postinstall] ${label}`);

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: false,
    env: process.env,
    windowsHide: true,
  });

  if (result.error) {
    console.error(`[postinstall] Failed: ${label}`, result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`[postinstall] Failed: ${label} (exit code ${result.status ?? 'unknown'})`);
    process.exit(result.status ?? 1);
  }
}

const electronInstallScript = join(projectRoot, 'node_modules', 'electron', 'install.js');

if (existsSync(electronInstallScript)) {
  runNodeScript(electronInstallScript, 'Ensuring Electron binary is installed');
} else {
  console.warn('[postinstall] Electron install script not found; skipping binary download');
}

runNodeScript(join(projectRoot, 'scripts', 'rebuild-electron.mjs'), 'Rebuilding native modules for Electron');
