import { copyFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import type { ApplicationContext } from '../services/applicationContext';
import { AppError, wrapIpcHandler } from '../utils/errors';
import { IPC_CHANNELS } from '@shared/types/ipc';
import type { ReportProgress } from '@shared/types/report';
import { parseReportGenerateInput } from '../services/report/reportValidation';

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

export function registerReportHandlers(ipcMain: IpcMain, ctx: ApplicationContext): void {
  ipcMain.handle(IPC_CHANNELS.REPORTS_GENERATE, (event: IpcMainInvokeEvent, input: unknown) =>
    wrapIpcHandler(async () => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      const parsed = parseReportGenerateInput(record);

      const generated = await ctx.reportsService.generate(parsed, (progress: ReportProgress) => {
        event.sender.send('reports:progress', progress);
      });

      return offerSaveDialog(event, generated.filePath, generated.fileName);
    }),
  );
}

async function offerSaveDialog(
  event: IpcMainInvokeEvent,
  tempPath: string,
  fileName: string,
): Promise<{ filePath: string; fileName: string }> {
  try {
    const electron = await import('electron');
    const window = electron.BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      return { filePath: tempPath, fileName };
    }

    const extension = fileName.endsWith('.xlsx') ? 'xlsx' : 'pdf';
    const result = await electron.dialog.showSaveDialog(window, {
      defaultPath: fileName,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
    });

    if (result.canceled || !result.filePath) {
      return { filePath: tempPath, fileName };
    }

    copyFileSync(tempPath, result.filePath);
    return { filePath: result.filePath, fileName: basename(result.filePath) };
  } catch {
    return { filePath: tempPath, fileName };
  }
}
