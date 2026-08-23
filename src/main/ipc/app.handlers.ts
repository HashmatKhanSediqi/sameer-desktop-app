import type { IpcMain } from 'electron';
import type { ApplicationContext } from '../services/applicationContext';
import { AppError, wrapIpcHandler } from '../utils/errors';
import { IPC_CHANNELS } from '@shared/types/ipc';

function parseSessionRequest(input: unknown): { sessionId: string } {
  if (!input || typeof input !== 'object') {
    throw new AppError('INVALID_REQUEST', 'Invalid request');
  }

  const record = input as Record<string, unknown>;
  if (typeof record.sessionId !== 'string' || record.sessionId.trim().length === 0) {
    throw new AppError('NOT_AUTHENTICATED', 'Authentication required');
  }

  return { sessionId: record.sessionId };
}

export function registerAppHandlers(ipcMain: IpcMain, ctx: ApplicationContext): void {
  ipcMain.handle(IPC_CHANNELS.APP_GET_PATHS, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      return ctx.paths;
    }),
  );

  ipcMain.handle(IPC_CHANNELS.APP_GET_STATUS, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      return {
        version: ctx.config.version,
        databaseConnected: ctx.database.isConnected(),
        databasePath: ctx.database.getPath(),
        databaseExists: ctx.database.databaseFileExists(),
      };
    }),
  );
}
