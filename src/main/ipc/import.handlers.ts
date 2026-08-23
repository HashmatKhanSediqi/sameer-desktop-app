import { copyFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import type { ApplicationContext } from '../services/applicationContext';
import { AppError, wrapIpcHandler } from '../utils/errors';
import { IPC_CHANNELS } from '@shared/types/ipc';
import type { ImportParseData, ParsedCustomer, ParsedTransaction } from '@shared/types/import';
import { IMPORT_TEMPLATE_FILE_NAME } from '../services/import/importConstants';
import { writeImportTemplate } from '../services/import/importTemplate';
import { emptyParse } from '../services/import/importService';

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

export function registerImportHandlers(ipcMain: IpcMain, ctx: ApplicationContext): void {
  ipcMain.handle(IPC_CHANNELS.IMPORT_PARSE, (event: IpcMainInvokeEvent, input: unknown) =>
    wrapIpcHandler(async () => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      const locale = ctx.settingsService.get().language;

      const filePath = await resolveImportFilePath(event, record.filePath);
      if (filePath === null) {
        return canceledParse(locale);
      }

      return ctx.importService.parseFile(filePath, locale, sessionId);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.IMPORT_COMMIT, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      const locale = ctx.settingsService.get().language;
      const customers = parseCustomerPayload(record.validCustomers);
      const transactions = parseTransactionPayload(record.validTransactions);
      return ctx.importService.commit(sessionId, customers, transactions, locale);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.IMPORT_DOWNLOAD_TEMPLATE, (event: IpcMainInvokeEvent, input: unknown) =>
    wrapIpcHandler(async () => {
      const { sessionId } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      const locale = ctx.settingsService.get().language;

      const tempDir = join(ctx.paths.cache, 'import');
      mkdirSync(tempDir, { recursive: true });
      const tempPath = join(tempDir, IMPORT_TEMPLATE_FILE_NAME);
      await writeImportTemplate(tempPath, locale);
      return offerSaveDialog(event, tempPath, IMPORT_TEMPLATE_FILE_NAME);
    }),
  );
}

async function resolveImportFilePath(event: IpcMainInvokeEvent, filePath: unknown): Promise<string | null> {
  if (typeof filePath === 'string' && filePath.trim().length > 0) {
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
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
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

    const result = await electron.dialog.showSaveDialog(window, {
      defaultPath: fileName,
      filters: [{ name: 'XLSX', extensions: ['xlsx'] }],
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

function canceledParse(locale: ReturnType<ApplicationContext['settingsService']['get']>['language']): ImportParseData {
  const parsed = emptyParse(undefined, locale, 'NO_DATA');
  return {
    ...parsed,
    success: false,
    canceled: true,
    errors: [],
    summary: { totalRows: 0, validCount: 0, errorCount: 0, warningCount: 0 },
  };
}

function parseCustomerPayload(value: unknown): ParsedCustomer[] {
  if (!Array.isArray(value)) {
    throw new AppError('INVALID_REQUEST', 'INVALID_REQUEST');
  }

  return value.map((item) => {
    if (!item || typeof item !== 'object') {
      throw new AppError('VALIDATION_ERROR', 'VALIDATION_ERROR');
    }
    const record = item as Record<string, unknown>;
    if (typeof record.row !== 'number' || !Number.isInteger(record.row) || record.row < 1) {
      throw new AppError('VALIDATION_ERROR', 'VALIDATION_ERROR');
    }
    return {
      row: record.row,
      name: optionalString(record.name),
      customerNumber: optionalString(record.customerNumber),
      hasPhoto: record.hasPhoto === true,
    };
  });
}

function parseTransactionPayload(value: unknown): ParsedTransaction[] {
  if (!Array.isArray(value)) {
    throw new AppError('INVALID_REQUEST', 'INVALID_REQUEST');
  }

  return value.map((item) => {
    if (!item || typeof item !== 'object') {
      throw new AppError('VALIDATION_ERROR', 'VALIDATION_ERROR');
    }
    const record = item as Record<string, unknown>;
    if (typeof record.row !== 'number' || !Number.isInteger(record.row) || record.row < 1) {
      throw new AppError('VALIDATION_ERROR', 'VALIDATION_ERROR');
    }
    if (typeof record.type !== 'string' || typeof record.currencyCode !== 'string' || typeof record.amount !== 'string') {
      throw new AppError('VALIDATION_ERROR', 'VALIDATION_ERROR');
    }
    if (typeof record.transactionDate !== 'string') {
      throw new AppError('VALIDATION_ERROR', 'VALIDATION_ERROR');
    }
    return {
      row: record.row,
      customerNumber: optionalString(record.customerNumber),
      customerName: optionalString(record.customerName),
      type: record.type as ParsedTransaction['type'],
      currencyCode: record.currencyCode,
      amount: record.amount,
      transactionDate: record.transactionDate,
      note: optionalString(record.note),
    };
  });
}

function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'VALIDATION_ERROR');
  }
  return value;
}
