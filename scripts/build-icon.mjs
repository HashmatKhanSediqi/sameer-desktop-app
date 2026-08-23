import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'assets', 'icons', 'iconn.png');
const target = join(root, 'assets', 'icons', 'icon.ico');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(npx, ['--yes', 'png-to-ico', source], {
  encoding: 'buffer',
  maxBuffer: 20 * 1024 * 1024,
  cwd: root,
  shell: true,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(result.stderr?.toString() ?? `png-to-ico exited with ${result.status}`);
  process.exit(result.status ?? 1);
}

if (!result.stdout || result.stdout.length < 6) {
  console.error('png-to-ico produced no icon data');
  process.exit(1);
}

writeFileSync(target, result.stdout);
console.log(`Wrote ${target} (${result.stdout.length} bytes, head ${result.stdout.subarray(0, 4).toString('hex')})`);
