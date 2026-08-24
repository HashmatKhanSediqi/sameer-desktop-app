/**
 * Explicit GitHub Releases configuration for FMT in-app updates.
 *
 * Packaged builds read electron-builder's generated `app-update.yml`.
 * Do not call autoUpdater.setFeedURL() in production — that overrides the
 * generated public GitHub feed and can force a private-provider/token path.
 *
 * `package.json` `"private": true` is an npm publish flag, not GitHub visibility.
 * The GitHub provider must stay `private: false` so end users do not need GH_TOKEN.
 *
 * Override owner/repo with FMT_UPDATE_OWNER / FMT_UPDATE_REPO only for tests.
 */
export const UPDATE_GITHUB_OWNER =
  (typeof process !== 'undefined' && process.env.FMT_UPDATE_OWNER?.trim()) || 'HashmatKhanSediqi';

export const UPDATE_GITHUB_REPO =
  (typeof process !== 'undefined' && process.env.FMT_UPDATE_REPO?.trim()) || 'sameer-desktop-app';

export const UPDATE_GITHUB_PROVIDER = 'github' as const;

/** Stable channel used by electron-updater for Windows NSIS (`latest.yml`). */
export const UPDATE_CHANNEL = 'latest';

/** Minimum interval between automatic background update checks. */
export const UPDATE_AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Delay after startup before the first automatic check (packaged builds only). */
export const UPDATE_AUTO_CHECK_STARTUP_DELAY_MS = 30_000;

export type UpdatePublishConfig = {
  provider: typeof UPDATE_GITHUB_PROVIDER;
  owner: string;
  repo: string;
  private: false;
  releaseType: 'release';
};

export function getUpdatePublishConfig(): UpdatePublishConfig {
  return {
    provider: UPDATE_GITHUB_PROVIDER,
    owner: UPDATE_GITHUB_OWNER,
    repo: UPDATE_GITHUB_REPO,
    private: false,
    releaseType: 'release',
  };
}

export function getGitHubReleasesAtomUrl(): string {
  const { owner, repo } = getUpdatePublishConfig();
  return `https://github.com/${owner}/${repo}/releases.atom`;
}

export function getGitHubLatestYmlUrl(): string {
  const { owner, repo } = getUpdatePublishConfig();
  return `https://github.com/${owner}/${repo}/releases/latest/download/latest.yml`;
}
