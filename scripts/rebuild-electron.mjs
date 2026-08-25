import { createRequire } from 'node:module';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const requireFromProject = createRequire(join(projectRoot, 'package.json'));

const NATIVE_MODULES = ['better-sqlite3', 'bcrypt'];

const electronVersion = requireFromProject('electron/package.json').version;
const { rebuild } = requireFromProject('@electron/rebuild');

const platform = process.platform;
const arch = process.arch;

console.log(
  `[rebuild:electron] Rebuilding ${NATIVE_MODULES.join(', ')} for Electron ${electronVersion} (${platform}/${arch})`,
);

if (platform !== 'win32') {
  console.warn(
    '[rebuild:electron] Dev/test rebuild on non-Windows host; packaged Windows installers must be built on Windows.',
  );
}

try {
  const rebuildPromise = rebuild({
    buildPath: projectRoot,
    electronVersion,
    arch,
    onlyModules: NATIVE_MODULES,
    force: true,
  });

  rebuildPromise.lifecycle.on('module-found', (moduleName) => {
    console.log(`[rebuild:electron] Module found: ${moduleName}`);
  });

  rebuildPromise.lifecycle.on('module-done', (moduleName) => {
    console.log(`[rebuild:electron] Module done: ${moduleName}`);
  });

  await rebuildPromise;

  console.log('[rebuild:electron] Native modules rebuilt for Electron');
} catch (error) {
  console.error('[rebuild:electron] Failed', error);
  process.exit(1);
}
