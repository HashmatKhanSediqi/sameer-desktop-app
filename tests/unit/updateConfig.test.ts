import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  UPDATE_AUTO_CHECK_INTERVAL_MS,
  UPDATE_CHANNEL,
  UPDATE_GITHUB_OWNER,
  UPDATE_GITHUB_REPO,
  getGitHubLatestYmlUrl,
  getGitHubReleasesAtomUrl,
  getUpdatePublishConfig,
} from '../../src/shared/constants/updateConfig';

describe('GitHub updater configuration', () => {
  it('exposes the public GitHub Releases owner/repo without a private-token requirement', () => {
    expect(UPDATE_GITHUB_OWNER).toBe('HashmatKhanSediqi');
    expect(UPDATE_GITHUB_REPO).toBe('sameer-desktop-app');
    expect(UPDATE_CHANNEL).toBe('latest');
    expect(getUpdatePublishConfig()).toEqual({
      provider: 'github',
      owner: UPDATE_GITHUB_OWNER,
      repo: UPDATE_GITHUB_REPO,
      private: false,
      releaseType: 'release',
    });
    expect(UPDATE_AUTO_CHECK_INTERVAL_MS).toBeGreaterThanOrEqual(60 * 60 * 1000);
    expect(getGitHubReleasesAtomUrl()).toBe(
      'https://github.com/HashmatKhanSediqi/sameer-desktop-app/releases.atom',
    );
    expect(getGitHubLatestYmlUrl()).toBe(
      'https://github.com/HashmatKhanSediqi/sameer-desktop-app/releases/latest/download/latest.yml',
    );
  });

  it('keeps electron-builder publish on the public GitHub provider', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      private: boolean;
      repository: { url: string };
      build: {
        publish: Array<{
          provider: string;
          owner: string;
          repo: string;
          private?: boolean;
          releaseType?: string;
        }>;
        nsis: { artifactName: string; deleteAppDataOnUninstall: boolean };
      };
    };

    expect(pkg.private).toBe(true);
    expect(pkg.repository.url).toContain('HashmatKhanSediqi/sameer-desktop-app');
    expect(pkg.build.publish).toHaveLength(1);
    expect(pkg.build.publish[0]).toMatchObject({
      provider: 'github',
      owner: 'HashmatKhanSediqi',
      repo: 'sameer-desktop-app',
      private: false,
      releaseType: 'release',
    });
    expect(pkg.build.nsis.artifactName).toBe('FMT-Setup.${ext}');
    expect(pkg.build.nsis.deleteAppDataOnUninstall).toBe(false);
  });
});
