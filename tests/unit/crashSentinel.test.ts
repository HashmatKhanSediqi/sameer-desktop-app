import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearCrashSentinel,
  crashSentinelPath,
  hadUncleanShutdown,
  setCrashSentinel,
} from '../../src/main/utils/crashSentinel';

describe('crash sentinel', () => {
  let tempRoot = '';

  afterEach(() => {
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = '';
    }
  });

  it('detects an unclean shutdown when the sentinel remains', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'ca-crash-'));
    writeFileSync(crashSentinelPath(tempRoot), 'previous\n', 'utf8');
    expect(hadUncleanShutdown(tempRoot)).toBe(true);
  });

  it('creates and clears the sentinel around a clean shutdown', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'ca-crash-'));
    expect(hadUncleanShutdown(tempRoot)).toBe(false);
    setCrashSentinel(tempRoot);
    expect(hadUncleanShutdown(tempRoot)).toBe(true);
    clearCrashSentinel(tempRoot);
    expect(hadUncleanShutdown(tempRoot)).toBe(false);
  });
});
