import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CRASH_SENTINEL_NAME = '.crash';

export function crashSentinelPath(userDataRoot: string): string {
  return join(userDataRoot, CRASH_SENTINEL_NAME);
}

export function hadUncleanShutdown(userDataRoot: string): boolean {
  return existsSync(crashSentinelPath(userDataRoot));
}

export function setCrashSentinel(userDataRoot: string): void {
  writeFileSync(crashSentinelPath(userDataRoot), `${new Date().toISOString()}\n`, 'utf8');
}

export function clearCrashSentinel(userDataRoot: string): void {
  const path = crashSentinelPath(userDataRoot);
  if (existsSync(path)) {
    unlinkSync(path);
  }
}
