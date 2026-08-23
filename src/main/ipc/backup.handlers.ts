import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import type { ApplicationContext } from '../services/applicationContext';
import { AppError, wrapIpcHandler } from '../utils/errors';
import { IPC_CHANNELS } from '@shared/types/ipc';
import { defaultBackupFileName, type BackupProgress } from '@shared/types/backup';

function parseSessionRequest(input: unknown): { sessionId: string; record: Record<string, unknown> } {
  if (!input || typeof input !== 'object') {
    throw new AppError('INVALID_REQUEST', 'Invalid request');
  }

  const record = input as Record<string, unknown>;
  if (typeof record.sessionId !== 'string' || record.sessionId.trim().length === 0) {
    throw new AppError('NOT_AUTHENTICATED', 'Authentication required');
  }

  return { sessionId: record.sessionId, record };
}

export function registerBackupHandlers(ipcMain: IpcMain, ctx: ApplicationContext): void {
  ipcMain.handle(IPC_CHANNELS.BACKUP_CREATE, (event: IpcMainInvokeEvent, input: unknown) =>
    wrapIpcHandler(async () => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      const destinationPath = await resolveBackupSavePath(event, record.destinationPath);
      if (destinationPath === null) {
        return { success: false as const, canceled: true as const };
      }
      return ctx.backupService.create(destinationPath, (progress) => sendProgress(event, progress));
    }),
  );

  ipcMain.handle(IPC_CHANNELS.BACKUP_VALIDATE, (event: IpcMainInvokeEvent, input: unknown) =>
    wrapIpcHandler(async () => {
      const filePath = await resolveBackupOpenPath(event, parseOptionalFilePath(input));
      if (filePath === null) {
        return {
          valid: false,
          canceled: true,
          errors: [],
          warnings: [],
          hasExistingData: ctx.backupService.hasExistingData(),
        };
      }
      return ctx.backupService.validate(filePath);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.RESTORE_EXECUTE, (event: IpcMainInvokeEvent, input: unknown) =>
    wrapIpcHandler(async () => {
      const request = parseRestoreRequest(input);
      return ctx.backupService.restore(request.filePath, request.confirmed, (progress) =>
        sendProgress(event, progress),
      );
    }),
  );
}

function parseOptionalFilePath(input: unknown): string | undefined {
  if (input === undefined || input === null) {
    return undefined;
  }
  if (typeof input !== 'object') {
    throw new AppError('INVALID_REQUEST', 'INVALID_REQUEST');
  }
  const record = input as Record<string, unknown>;
  if (record.filePath === undefined) {
    return undefined;
  }
  if (typeof record.filePath !== 'string') {
    throw new AppError('INVALID_REQUEST', 'INVALID_REQUEST');
  }
  return record.filePath;
}

function parseRestoreRequest(input: unknown): { filePath: string; confirmed: boolean } {
  if (!input || typeof input !== 'object') {
    throw new AppError('INVALID_REQUEST', 'INVALID_REQUEST');
  }
  const record = input as Record<string, unknown>;
  if (record.confirmed !== true) {
    throw new AppError('RESTORE_CONFIRM_REQUIRED', 'confirmRequired');
  }
  if (record.filePath !== undefined && typeof record.filePath !== 'string') {
    throw new AppError('INVALID_REQUEST', 'INVALID_REQUEST');
  }
  return {
    filePath: typeof record.filePath === 'string' ? record.filePath.trim() : '',
    confirmed: true,
  };
}

function sendProgress(event: IpcMainInvokeEvent, progress: BackupProgress): void {
  event.sender.send('backup:progress', progress);
}

async function resolveBackupSavePath(
  event: IpcMainInvokeEvent,
  destinationPath: unknown,
): Promise<string | null> {
  if (typeof destinationPath === 'string' && destinationPath.trim().length > 0) {
    return destinationPath.trim();
  }

  try {
    const electron = await import('electron');
    const window = electron.BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      throw new AppError('INVALID_REQUEST', 'INVALID_REQUEST');
    }

    const defaultName = defaultBackupFileName();
    const result = await electron.dialog.showSaveDialog(window, {
      defaultPath: defaultName,
      filters: [{ name: 'CAB', extensions: ['cab'] }],
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    return result.filePath;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('INVALID_REQUEST', 'INVALID_REQUEST');
  }
}

async function resolveBackupOpenPath(
  event: IpcMainInvokeEvent,
  filePath: string | undefined,
): Promise<string | null> {
  if (typeof filePath === 'string' && filePath.trim().length === 0) {
    throw new AppError('INVALID_REQUEST', 'INVALID_REQUEST');
  }
  if (filePath) {
    return filePath.trim();
  }

  try {
    const electron = await import('electron');
    const window = electron.BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      throw new AppError('INVALID_REQUEST', 'INVALID_REQUEST');
    }

    const result = await electron.dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [{ name: 'CAB', extensions: ['cab'] }],
    });

    if (result.canceled || !result.filePaths[0]) {
      return null;
    }

    return result.filePaths[0];
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('INVALID_REQUEST', 'INVALID_REQUEST');
  }
}
