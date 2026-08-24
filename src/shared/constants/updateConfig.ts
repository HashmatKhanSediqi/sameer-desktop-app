/**
 * Explicit GitHub Releases configuration for FMT in-app updates.
 *
 * Owner/repo are taken from the project's known origin remote.
 * Override with FMT_UPDATE_OWNER / FMT_UPDATE_REPO when needed.
 * Do not publish releases from the updater implementation itself.
 */
export const UPDATE_GITHUB_OWNER =
  (typeof process !== 'undefined' && process.env.FMT_UPDATE_OWNER?.trim()) || 'HashmatKhanSediqi';

export const UPDATE_GITHUB_REPO =
  (typeof process !== 'undefined' && process.env.FMT_UPDATE_REPO?.trim()) || 'sameer-desktop-app';

/** Minimum interval between automatic background update checks. */
export const UPDATE_AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Delay after startup before the first automatic check (packaged builds only). */
export const UPDATE_AUTO_CHECK_STARTUP_DELAY_MS = 30_000;

export function getUpdatePublishConfig(): {
  provider: 'github';
  owner: string;
  repo: string;
} {
  return {
    provider: 'github',
    owner: UPDATE_GITHUB_OWNER,
    repo: UPDATE_GITHUB_REPO,
  };
}
