import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json';
import { loadAppConfig } from '../../src/main/config/appConfig';
import { APP_VERSION } from '../../src/shared/constants/version';

describe('appConfig', () => {
  it('loads stable application metadata from the package version', () => {
    const config = loadAppConfig();

    expect(APP_VERSION).toBe(packageJson.version);
    expect(config.appName).toBe('FMT');
    expect(config.version).toBe(packageJson.version);
    expect(config.version).toBe(APP_VERSION);
    expect(config.logMaxFiles).toBe(5);
    expect(config.sessionIdleTimeoutMs).toBe(8 * 60 * 60 * 1000);
    expect(config.isDev).toBe(process.env.NODE_ENV === 'development');
  });
});
