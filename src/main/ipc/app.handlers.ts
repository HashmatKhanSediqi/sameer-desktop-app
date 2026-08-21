import type { IpcMain } from 'electron';
import type { ApplicationContext } from '../services/applicationContext';
import { wrapIpcHandler } from '../utils/errors';
import { IPC_CHANNELS } from '@shared/types/ipc';

export function registerAppHandlers(ipcMain: IpcMain, ctx: ApplicationContext): void {
  ipcMain.handle(IPC_CHANNELS.APP_GET_PATHS, () =>
    wrapIpcHandler(() => ctx.paths),
  );

  ipcMain.handle(IPC_CHANNELS.APP_GET_STATUS, () =>
    wrapIpcHandler(() => ({
      version: ctx.config.version,
      databaseConnected: ctx.database.isConnected(),
      databasePath: ctx.database.getPath(),
      databaseExists: ctx.database.databaseFileExists(),
    })),
  );
}
