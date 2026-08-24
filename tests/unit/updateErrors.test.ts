import { describe, expect, it } from 'vitest';
import { isNoUpdateAvailableError } from '../../src/main/services/update/updateErrors';

describe('isNoUpdateAvailableError', () => {
  it('recognizes electron-updater no-update messages', () => {
    expect(isNoUpdateAvailableError(new Error('No published updates available'))).toBe(true);
    expect(isNoUpdateAvailableError(new Error('update is not available'))).toBe(true);
    expect(isNoUpdateAvailableError(new Error('current version is already the latest'))).toBe(true);
  });

  it('does not treat network or HTTP failures as no-update', () => {
    expect(isNoUpdateAvailableError(new Error('ENOTFOUND api.github.com'))).toBe(false);
    expect(isNoUpdateAvailableError(new Error('status code 404'))).toBe(false);
    expect(isNoUpdateAvailableError(new Error('not found: latest.yml'))).toBe(false);
    expect(isNoUpdateAvailableError(new Error('offline'))).toBe(false);
  });
});
