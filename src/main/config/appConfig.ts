import { APP_VERSION } from '@shared/constants/version';

export interface AppConfig {
  appName: string;
  version: string;
  isDev: boolean;
  logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  logMaxSizeBytes: number;
  logMaxFiles: number;
  sessionIdleTimeoutMs: number;
}

export function loadAppConfig(): AppConfig {
  // Packaged Electron does not always set NODE_ENV. Treat only an explicit
  // development env as dev so production logs/update paths stay production.
  const isDev = process.env.NODE_ENV === 'development';

  return {
    appName: 'FMT',
    version: readElectronAppVersion() ?? APP_VERSION,
    isDev,
    logLevel: isDev ? 'DEBUG' : 'INFO',
    logMaxSizeBytes: 5 * 1024 * 1024,
    logMaxFiles: 5,
    sessionIdleTimeoutMs: 8 * 60 * 60 * 1000,
  };
}

function readElectronAppVersion(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as unknown;
    if (!electron || typeof electron !== 'object') {
      return undefined;
    }
    const app = (electron as { app?: { getVersion?: () => string } }).app;
    const version = app?.getVersion?.();
    return typeof version === 'string' && version.trim().length > 0 ? version.trim() : undefined;
  } catch {
    return undefined;
  }
}
