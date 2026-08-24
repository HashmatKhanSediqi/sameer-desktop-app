import type { UpdateProgress } from '@shared/types/update';

export interface UpdateCheckResultLike {
  updateInfo: {
    version: string;
    releaseNotes?: string | null | Array<{ version: string; note: string | null }> | null;
  };
  isUpdateAvailable?: boolean;
  downloadPromise?: Promise<unknown> | null;
}

export type ElectronUpdaterEvent =
  | 'checking-for-update'
  | 'update-available'
  | 'update-not-available'
  | 'download-progress'
  | 'update-downloaded'
  | 'update-cancelled'
  | 'error';

export interface ElectronUpdaterAdapter {
  autoDownload: boolean;
  allowDowngrade: boolean;
  autoInstallOnAppQuit: boolean;
  logger: unknown;
  checkForUpdates(): Promise<UpdateCheckResultLike | null>;
  downloadUpdate(): Promise<string[]>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on(event: 'download-progress', listener: (progress: UpdateProgress) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  on(event: 'update-downloaded', listener: (info: { version: string }) => void): void;
  on(event: 'update-not-available', listener: (info?: { version?: string }) => void): void;
  on(event: 'update-available', listener: (info?: { version?: string }) => void): void;
  on(event: 'checking-for-update', listener: () => void): void;
  on(event: 'update-cancelled', listener: (error?: Error) => void): void;
  removeAllListeners(event?: string): void;
}

export function createElectronUpdaterAdapter(): ElectronUpdaterAdapter | null {
  try {
    // Lazy require so unit tests and non-Electron hosts can run without native updater wiring.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { autoUpdater } = require('electron-updater') as {
      autoUpdater: ElectronUpdaterAdapter;
    };
    return autoUpdater;
  } catch {
    return null;
  }
}
