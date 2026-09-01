import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const setupPath = join(projectRoot, 'dist', 'FMT-Setup.exe');
const latestPath = join(projectRoot, 'dist', 'latest.yml');
const sumsPath = join(projectRoot, 'dist', 'SHA256SUMS.txt');
const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));

function fail(message) {
  console.error(`[verify-win-installer] ${message}`);
  process.exit(1);
}

if (!existsSync(setupPath)) {
  fail(`Missing installer: ${setupPath}`);
}
if (!existsSync(latestPath)) {
  fail(`Missing latest.yml: ${latestPath}`);
}

const bytes = readFileSync(setupPath);
if (bytes.length < 64 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) {
  fail('FMT-Setup.exe is not a Windows PE executable (missing MZ header)');
}

const peOff = bytes.readUInt32LE(0x3c);
if (peOff + 4 > bytes.length || bytes.toString('ascii', peOff, peOff + 4) !== 'PE\0\0') {
  fail('FMT-Setup.exe PE signature is missing');
}

const machine = bytes.readUInt16LE(peOff + 4);
if (machine !== 0x14c) {
  fail(`FMT-Setup.exe PE machine is 0x${machine.toString(16)}, expected i386 NSIS stub (0x14c)`);
}

const optMagic = bytes.readUInt16LE(peOff + 24);
const subsystemOff = optMagic === 0x20b ? peOff + 24 + 68 : peOff + 92;
const subsystem = bytes.readUInt16LE(subsystemOff);
if (subsystem !== 2) {
  fail(`FMT-Setup.exe subsystem is ${subsystem}, expected GUI (2)`);
}

const headAscii = bytes.subarray(0, Math.min(bytes.length, 600000)).toString('latin1');
if (!headAscii.includes('NullsoftInst')) {
  fail('FMT-Setup.exe is not an NSIS installer (NullsoftInst signature missing)');
}

const sha512 = createHash('sha512').update(bytes).digest('base64');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const latest = readFileSync(latestPath, 'utf8');
if (!latest.includes(sha512)) {
  fail(`latest.yml sha512 does not match FMT-Setup.exe\n  installer: ${sha512}`);
}
if (!latest.includes(`version: ${pkg.version}`)) {
  fail(`latest.yml version does not match package.json ${pkg.version}`);
}

const infoText = execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-Command',
    `$v = [System.Diagnostics.FileVersionInfo]::GetVersionInfo('${setupPath.replace(/'/g, "''")}'); Write-Output $v.ProductName; Write-Output $v.FileDescription; Write-Output $v.FileVersion`,
  ],
  { encoding: 'utf8' },
).trim().split(/\r?\n/);
const [productName, fileDescription, fileVersion] = infoText;
if (productName !== 'FMT') {
  fail(`Installer ProductName is ${JSON.stringify(productName)}, expected FMT`);
}
if (!fileDescription?.includes('FMT')) {
  fail(`Installer FileDescription is ${JSON.stringify(fileDescription)}, expected FMT`);
}
if (!fileVersion?.startsWith(pkg.version)) {
  fail(`Installer FileVersion is ${JSON.stringify(fileVersion)}, expected ${pkg.version}`);
}

writeFileSync(sumsPath, `${sha256}  FMT-Setup.exe\n`);

console.log(`[verify-win-installer] OK PE32 i386 GUI NSIS ${bytes.length} bytes`);
console.log(`[verify-win-installer] version ${pkg.version} ProductName=${productName}`);
console.log(`[verify-win-installer] sha256 ${sha256}`);
console.log(`[verify-win-installer] sha512 matches latest.yml`);
console.log(`[verify-win-installer] wrote ${sumsPath}`);
