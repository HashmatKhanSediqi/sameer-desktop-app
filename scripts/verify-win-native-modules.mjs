import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const NATIVE_MODULE_PATHS = [
  join(
    projectRoot,
    'dist',
    'win-unpacked',
    'resources',
    'app.asar.unpacked',
    'node_modules',
    'bcrypt',
    'lib',
    'binding',
    'napi-v3',
    'bcrypt_lib.node',
  ),
  join(
    projectRoot,
    'dist',
    'win-unpacked',
    'resources',
    'app.asar.unpacked',
    'node_modules',
    'better-sqlite3',
    'build',
    'Release',
    'better_sqlite3.node',
  ),
];

function describeBinary(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return 'PE (Windows)';
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x7f &&
    buffer[1] === 0x45 &&
    buffer[2] === 0x4c &&
    buffer[3] === 0x46
  ) {
    return 'ELF (Linux/Unix)';
  }
  return 'unknown';
}

let failed = false;

for (const modulePath of NATIVE_MODULE_PATHS) {
  if (!existsSync(modulePath)) {
    console.error(`[verify-win-native] Missing native module: ${modulePath}`);
    failed = true;
    continue;
  }

  const bytes = readFileSync(modulePath);
  const kind = describeBinary(bytes);
  const relative = modulePath.replace(`${projectRoot}\\`, '').replace(`${projectRoot}/`, '');

  if (kind !== 'PE (Windows)') {
    console.error(`[verify-win-native] ${relative} is ${kind}, expected PE (Windows)`);
    failed = true;
    continue;
  }

  console.log(`[verify-win-native] OK ${relative} (${bytes.length} bytes, PE)`);
}

if (failed) {
  console.error('[verify-win-native] Native module verification failed.');
  process.exit(1);
}

console.log('[verify-win-native] All packaged native modules are Windows PE binaries.');
