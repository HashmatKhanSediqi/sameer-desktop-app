import { BrowserWindow, type IpcMain } from 'electron';
import type { ApplicationContext } from '../services/applicationContext';
import { AppError, wrapIpcHandler } from '../utils/errors';
import { IPC_CHANNELS, UPDATE_STATUS_EVENT } from '@shared/types/ipc';
import type { UpdateStatusSnapshot } from '@shared/types/update';

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

function broadcastUpdateStatus(status: UpdateStatusSnapshot): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(UPDATE_STATUS_EVENT, status);
  }
}

export function registerUpdateHandlers(ipcMain: IpcMain, ctx: ApplicationContext): void {
  ctx.updateService.onStatus((status) => {
    broadcastUpdateStatus(status);
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_GET_STATUS, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      return ctx.updateService.getStatus();
    }),
  );

  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, (_event, input: unknown) =>
    wrapIpcHandler(async () => {
      const { sessionId } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      try {
        return await ctx.updateService.checkForUpdates();
      } catch (error) {
        if (error instanceof AppError && error.code === 'UPDATE_CHECK_FAILED') {
          return ctx.updateService.getStatus();
        }
        throw error;
      }
    }),
  );

  ipcMain.handle(IPC_CHANNELS.UPDATE_DOWNLOAD, (_event, input: unknown) =>
    wrapIpcHandler(async () => {
      const { sessionId } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      try {
        return await ctx.updateService.downloadUpdate();
      } catch (error) {
        if (error instanceof AppError && error.code === 'UPDATE_DOWNLOAD_FAILED') {
          return ctx.updateService.getStatus();
        }
        throw error;
      }
    }),
  );

  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, (_event, input: unknown) =>
    wrapIpcHandler(async () => {
      const { sessionId } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      return ctx.updateService.installUpdate();
    }),
  );
}
