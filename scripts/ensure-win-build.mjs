import process from 'node:process';

/**
 * FMT ships native modules (bcrypt, better-sqlite3) that must be compiled for
 * Windows + Electron. Cross-building the NSIS installer on Linux produces a
 * valid-looking FMT-Setup.exe that still contains Linux ELF .node binaries,
 * which fail at runtime with "is not a valid Win32 application".
 */
if (process.platform !== 'win32') {
  console.error(
    [
      '[build:win] Windows installer builds must run on Windows (x64).',
      '[build:win] Native modules cannot be cross-compiled reliably from Linux/macOS.',
      '[build:win] Use GitHub Actions (windows-latest) or a Windows machine with:',
      '            npm ci && npm run build:win',
    ].join('\n'),
  );
  process.exit(1);
}

if (process.arch !== 'x64') {
  console.error(`[build:win] Expected x64 build host; got ${process.arch}.`);
  process.exit(1);
}

console.log('[build:win] Windows x64 build host confirmed');
