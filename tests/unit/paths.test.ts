import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureUserDataDirectories, resolveAppPaths } from '../../src/main/config/paths';

describe('paths', () => {
  let tempRoot: string;

  afterEach(() => {
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('resolves documented user-data subpaths', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'ca-paths-'));
    const paths = resolveAppPaths(tempRoot);

    expect(paths.userData).toBe(tempRoot);
    expect(paths.database).toBe(join(tempRoot, 'data', 'accounting.db'));
    expect(paths.images).toBe(join(tempRoot, 'data', 'images', 'customers'));
    expect(paths.companyImages).toBe(join(tempRoot, 'data', 'images', 'company'));
    expect(paths.logs).toBe(join(tempRoot, 'logs'));
    expect(paths.backups).toBe(join(tempRoot, 'backups'));
    expect(paths.cache).toBe(join(tempRoot, 'cache'));
    expect(paths.config).toBe(join(tempRoot, 'config'));
  });

  it('creates required user-data directories', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'ca-paths-'));
    const paths = resolveAppPaths(tempRoot);

    ensureUserDataDirectories(paths);

    expect(() => ensureUserDataDirectories(paths)).not.toThrow();
  });
});
