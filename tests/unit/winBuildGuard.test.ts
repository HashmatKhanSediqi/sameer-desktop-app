import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json';

describe('Windows release build guard', () => {
  it('requires a Windows host before building the NSIS installer', () => {
    expect(packageJson.scripts['build:win']).toContain('scripts/ensure-win-build.mjs');
    expect(packageJson.scripts['build:win']).toContain('scripts/verify-win-native-modules.mjs');
  });

  it('disables NSIS differential packages to avoid double-download fallback', () => {
    expect(packageJson.build.nsis.differentialPackage).toBe(false);
  });
});
