import { describe, expect, it } from 'vitest';
import { compareSemVer, isNewerVersion, isSameVersion, parseSemVer } from '../../src/shared/semver';

describe('semver helpers', () => {
  it('parses valid semantic versions and rejects invalid ones', () => {
    expect(parseSemVer('1.0.0')).toEqual({ major: 1, minor: 0, patch: 0, prerelease: null });
    expect(parseSemVer('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: null });
    expect(parseSemVer('1.0.0-beta.1')?.prerelease).toBe('beta.1');
    expect(parseSemVer('')).toBeNull();
    expect(parseSemVer('1.0')).toBeNull();
    expect(parseSemVer('not-a-version')).toBeNull();
  });

  it('compares versions for newer / same / older detection', () => {
    expect(compareSemVer('1.0.1', '1.0.0')).toBeGreaterThan(0);
    expect(compareSemVer('1.0.0', '1.0.0')).toBe(0);
    expect(compareSemVer('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(isNewerVersion('1.1.0', '1.0.0')).toBe(true);
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
    expect(isNewerVersion('0.9.9', '1.0.0')).toBe(false);
    expect(isSameVersion('v1.0.0', '1.0.0')).toBe(true);
    expect(isNewerVersion('bad', '1.0.0')).toBe(false);
  });
});
