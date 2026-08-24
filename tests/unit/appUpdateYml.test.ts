import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('packaged app-update.yml', () => {
  it('keeps the GitHub provider public when a packaged resources file is present', () => {
    const ymlPath = join(process.cwd(), 'dist', 'win-unpacked', 'resources', 'app-update.yml');
    if (!existsSync(ymlPath)) {
      return;
    }

    const yml = readFileSync(ymlPath, 'utf8');
    expect(yml).toMatch(/provider:\s*github/);
    expect(yml).toMatch(/owner:\s*HashmatKhanSediqi/);
    expect(yml).toMatch(/repo:\s*sameer-desktop-app/);
    expect(yml).not.toMatch(/private:\s*true/);
    expect(yml).not.toMatch(/token:/);
  });
});
