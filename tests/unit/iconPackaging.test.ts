import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json';

describe('Windows icon packaging', () => {
  it('ships a valid multi-image ICO and points electron-builder at it', () => {
    const icoPath = join(process.cwd(), 'assets', 'icons', 'icon.ico');
    const bytes = readFileSync(icoPath);
    expect(bytes[0]).toBe(0);
    expect(bytes[1]).toBe(0);
    expect(bytes[2]).toBe(1);
    expect(bytes[3]).toBe(0);
    const imageCount = (bytes[4] ?? 0) + (bytes[5] ?? 0) * 256;
    expect(imageCount).toBeGreaterThanOrEqual(4);

    expect(packageJson.build.icon).toBe('assets/icons/icon.ico');
    expect(packageJson.build.win.icon).toBe('assets/icons/icon.ico');
    expect(packageJson.build.nsis.installerIcon).toBe('assets/icons/icon.ico');
    expect(packageJson.build.nsis.include).toBe('assets/installer/installer.nsh');
    const nsh = readFileSync(join(process.cwd(), 'assets', 'installer', 'installer.nsh'), 'utf8');
    expect(nsh).toMatch(/isUpdated/);
    expect(nsh).toMatch(/SetSilent silent/);
    expect(packageJson.build.nsis.createDesktopShortcut).toBe(true);
    expect(packageJson.build.win.signAndEditExecutable).toBe(false);
    expect(packageJson.build.afterPack).toBe('scripts/after-pack-icon.cjs');
  });
});
