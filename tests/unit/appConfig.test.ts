import { describe, expect, it } from 'vitest';
import { loadAppConfig } from '../../src/main/config/appConfig';
import { APP_VERSION } from '../../src/shared/constants/version';

describe('appConfig', () => {
  it('loads stable application metadata', () => {
    const config = loadAppConfig();

    expect(config.appName).toBe('FMT');
    expect(config.version).toBe(APP_VERSION);
    expect(config.logMaxFiles).toBe(5);
    expect(config.sessionIdleTimeoutMs).toBe(8 * 60 * 60 * 1000);
  });
});
