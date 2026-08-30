import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { suggestTellerExportFileName } from '@shared/teller/worksheetRows';
import type { ApplicationContext } from '../services/applicationContext';
import { AppError, wrapIpcHandler } from '../utils/errors';
import { IPC_CHANNELS } from '@shared/types/ipc';
import type { TellerDirection } from '@shared/types/teller';
import { parsePositiveIntegerId } from '../services/transaction/transactionValidation';

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

function parseOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'INVALID_REQUEST');
  }
  return value;
}

function parseCounts(value: unknown): Record<string, number> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError('TELLER_DENOMINATION_INVALID', 'TELLER_DENOMINATION_INVALID');
  }
  return value as Record<string, number>;
}

export function registerTellerHandlers(ipcMain: IpcMain, ctx: ApplicationContext): void {
  ipcMain.handle(IPC_CHANNELS.TELLER_DENOMINATIONS_LIST, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      const currencyCode = parseOptionalString(record.currencyCode);
      return { denominations: ctx.tellerService.listDenominations(currencyCode) };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TELLER_SESSION_CURRENT, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      const currencyCode = parseOptionalString(record.currencyCode);
      const sessions = ctx.tellerService.listOpenSessions();
      const session = currencyCode
        ? ctx.tellerService.getCurrentSession(currencyCode)
        : (sessions[0] ?? null);
      return { session, sessions };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TELLER_SESSION_OPEN, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      const session = ctx.authService.requireSession(sessionId);
      const opened = ctx.tellerService.openSession(session.userId, {
        currencyCode: typeof record.currencyCode === 'string' ? record.currencyCode : '',
        sessionDate: parseOptionalString(record.sessionDate),
        branchName: record.branchName === null ? null : parseOptionalString(record.branchName),
        branchCode: record.branchCode === null ? null : parseOptionalString(record.branchCode),
        openingCounts: parseCounts(record.openingCounts),
        openingAmount: parseOptionalString(record.openingAmount),
        oppAmount: parseOptionalString(record.oppAmount),
        cashInICBA: parseOptionalString(record.cashInICBA),
        cashOutICBA: parseOptionalString(record.cashOutICBA),
        note: record.note === null ? null : parseOptionalString(record.note),
      });
      return { session: opened };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TELLER_SESSION_CLOSE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      const session = ctx.authService.requireSession(sessionId);
      const closed = ctx.tellerService.closeSession(
        session.userId,
        parsePositiveIntegerId(record.tellerSessionId, 'TELLER_SESSION_NOT_FOUND'),
      );
      return { session: closed };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TELLER_DAY_END, (event: IpcMainInvokeEvent, input: unknown) =>
    wrapIpcHandler(async () => {
      const { sessionId, record } = parseSessionRequest(input);
      const session = ctx.authService.requireSession(sessionId);
      const tellerSessionId = parsePositiveIntegerId(record.tellerSessionId, 'TELLER_SESSION_NOT_FOUND');
      const worksheetRows = typeof record.worksheetRows === 'number' ? record.worksheetRows : undefined;
      let filePath = parseOptionalString(record.filePath);
      if (!filePath) {
        const chosen = await chooseExportPath(
          event,
          parseOptionalString(record.fileName) ?? suggestTellerExportFileName('CUR', ''),
        );
        if (!chosen) {
          return { canceled: true as const };
        }
        filePath = chosen;
      }
      return ctx.tellerService.endDay(session.userId, tellerSessionId, filePath, worksheetRows);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TELLER_DAY_START, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      const session = ctx.authService.requireSession(sessionId);
      const currencyCode = parseOptionalString(record.currencyCode);
      if (!currencyCode) {
        throw new AppError('INVALID_CURRENCY', 'CURRENCY_REQUIRED');
      }
      return ctx.tellerService.startDay(session.userId, currencyCode);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TELLER_CASH_RESET, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      const session = ctx.authService.requireSession(sessionId);
      const currencyCode = parseOptionalString(record.currencyCode);
      if (!currencyCode) {
        throw new AppError('INVALID_CURRENCY', 'CURRENCY_REQUIRED');
      }
      return ctx.tellerService.resetCash(session.userId, currencyCode);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TELLER_SESSION_UPDATE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      const session = ctx.authService.requireSession(sessionId);
      const updated = ctx.tellerService.updateSession(session.userId, {
        sessionId: parsePositiveIntegerId(record.tellerSessionId, 'TELLER_SESSION_NOT_FOUND'),
        branchName: record.branchName === undefined ? undefined : record.branchName === null ? null : parseOptionalString(record.branchName),
        branchCode: record.branchCode === undefined ? undefined : record.branchCode === null ? null : parseOptionalString(record.branchCode),
        openingCounts: parseCounts(record.openingCounts),
        openingAmount: parseOptionalString(record.openingAmount),
        oppAmount: parseOptionalString(record.oppAmount),
        cashInICBA: parseOptionalString(record.cashInICBA),
        cashOutICBA: parseOptionalString(record.cashOutICBA),
        note: record.note === undefined ? undefined : record.note === null ? null : parseOptionalString(record.note),
      });
      return { session: updated };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TELLER_SHEET_GET, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      const session = ctx.authService.requireSession(sessionId);
      const currencyCode = parseOptionalString(record.currencyCode);
      if (!currencyCode) {
        throw new AppError('INVALID_CURRENCY', 'CURRENCY_REQUIRED');
      }
      return ctx.tellerService.getSheet(currencyCode, {
        userId: session.userId,
        sessionDate: parseOptionalString(record.sessionDate),
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TELLER_TRANSACTIONS_UPSERT, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      const session = ctx.authService.requireSession(sessionId);
      const transaction = ctx.tellerService.upsertTransaction(session.userId, {
        id: typeof record.id === 'number' ? record.id : undefined,
        sessionId: parsePositiveIntegerId(record.tellerSessionId, 'TELLER_SESSION_NOT_FOUND'),
        direction: record.direction as TellerDirection,
        referenceLabel: parseOptionalString(record.referenceLabel) ?? '',
        declaredAmount: record.declaredAmount === null ? null : parseOptionalString(record.declaredAmount),
        denominationCounts: parseCounts(record.denominationCounts) ?? {},
      });
      return { transaction };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TELLER_TRANSACTIONS_LIST, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      return ctx.tellerService.listTransactions({
        page: typeof record.page === 'number' ? record.page : undefined,
        pageSize: typeof record.pageSize === 'number' ? record.pageSize : undefined,
        sessionId: typeof record.tellerSessionId === 'number' ? record.tellerSessionId : undefined,
        currencyCode: parseOptionalString(record.currencyCode),
        direction: record.direction === 'DEPOSIT' || record.direction === 'WITHDRAWAL' ? record.direction : undefined,
        referenceLabel: parseOptionalString(record.referenceLabel),
        dateFrom: parseOptionalString(record.dateFrom),
        dateTo: parseOptionalString(record.dateTo),
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TELLER_TRANSACTIONS_GET, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      return {
        transaction: ctx.tellerService.getTransaction(
          parsePositiveIntegerId(record.transactionId, 'TELLER_TRANSACTION_NOT_FOUND'),
        ),
      };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TELLER_TRANSACTIONS_DELETE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      return ctx.tellerService.deleteTransaction(
        parsePositiveIntegerId(record.transactionId, 'TELLER_TRANSACTION_NOT_FOUND'),
      );
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TELLER_LONG_BOOK_GET, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      const currencyCode = parseOptionalString(record.currencyCode);
      if (!currencyCode) {
        throw new AppError('INVALID_CURRENCY', 'CURRENCY_REQUIRED');
      }
      return ctx.tellerService.getLongBook(
        typeof record.tellerSessionId === 'number' ? record.tellerSessionId : undefined,
        currencyCode,
        typeof record.page === 'number' ? record.page : undefined,
        typeof record.pageSize === 'number' ? record.pageSize : undefined,
      );
    }),
  );
}

async function chooseExportPath(event: IpcMainInvokeEvent, fileName: string): Promise<string | null> {
  const electron = await import('electron');
  const window = electron.BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    return null;
  }
  const result = await electron.dialog.showSaveDialog(window, {
    defaultPath: fileName,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  });
  if (result.canceled || !result.filePath) {
    return null;
  }
  return result.filePath;
}
