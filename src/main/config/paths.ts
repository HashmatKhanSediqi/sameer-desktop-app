import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AppPaths } from '@shared/types/ipc';

const APP_FOLDER_NAME = 'CustomerAccounting';

type ElectronApp = {
  isReady: () => boolean;
  getPath: (name: 'userData' | 'appData') => string;
};

function getElectronApp(): ElectronApp {
  try {
    // Lazy load so Node-based tests do not require a working Electron install.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as { app?: ElectronApp };
    if (!electron.app) {
      throw new Error('Electron app module is unavailable');
    }
    return electron.app;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load Electron app module: ${message}`);
  }
}

export function getUserDataRoot(): string {
  const app = getElectronApp();

  if (app.isReady()) {
    return app.getPath('userData');
  }

  return join(app.getPath('appData'), APP_FOLDER_NAME);
}

export function resolveAppPaths(userDataRoot?: string): AppPaths {
  const root = userDataRoot ?? getUserDataRoot();

  return {
    userData: root,
    database: join(root, 'data', 'accounting.db'),
    images: join(root, 'data', 'images', 'customers'),
    companyImages: join(root, 'data', 'images', 'company'),
    logs: join(root, 'logs'),
    backups: join(root, 'backups'),
    cache: join(root, 'cache'),
    config: join(root, 'config'),
  };
}

export function ensureUserDataDirectories(paths: AppPaths): void {
  const directories = [
    join(paths.userData, 'data'),
    join(paths.userData, 'data', 'images', 'customers'),
    paths.companyImages,
    paths.logs,
    join(paths.backups, 'auto'),
    join(paths.backups, 'pre-update'),
    join(paths.backups, 'scheduled'),
    join(paths.cache, 'reports'),
    join(paths.cache, 'updates'),
    paths.config,
  ];

  for (const dir of directories) {
    mkdirSync(dir, { recursive: true });
  }
}
