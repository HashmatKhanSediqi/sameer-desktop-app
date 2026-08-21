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
  const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

  return {
    appName: 'Customer Accounting',
    version: APP_VERSION,
    isDev,
    logLevel: isDev ? 'DEBUG' : 'INFO',
    logMaxSizeBytes: 5 * 1024 * 1024,
    logMaxFiles: 5,
    sessionIdleTimeoutMs: 8 * 60 * 60 * 1000,
  };
}
