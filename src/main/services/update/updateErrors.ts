/**
 * electron-updater sometimes rejects with a "no update" message instead of
 * resolving with the current version. Those must not be treated as network
 * failures, otherwise Settings shows the offline error while the app is
 * simply up to date.
 */
export function isNoUpdateAvailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (
    /enotfound|econnreset|etimedout|enetunreach|offline|network request failed|status code 4\d\d|status code 5\d\d|certificate|not found: latest\.yml|cannot find channel/.test(
      normalized,
    )
  ) {
    return false;
  }

  return (
    /no (published )?updates? available/.test(normalized) ||
    /update (is )?not available/.test(normalized) ||
    /not a newer version/.test(normalized) ||
    /is not newer/.test(normalized) ||
    /update-not-available/.test(normalized) ||
    /current version is already the latest/.test(normalized)
  );
}
