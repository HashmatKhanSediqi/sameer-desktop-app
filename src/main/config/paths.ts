import { app } from 'electron';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AppPaths } from '@shared/types/ipc';

const APP_FOLDER_NAME = 'CustomerAccounting';

export function getUserDataRoot(): string {
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
