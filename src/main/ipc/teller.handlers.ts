import type { IpcMain } from 'electron';
import type { ApplicationContext } from '../services/applicationContext';
import { AppError, wrapIpcHandler } from '../utils/errors';
import { IPC_CHANNELS } from '@shared/types/ipc';
import type { CreateTellerTransactionInput, TellerTransactionTypeCode } from '@shared/types/teller';
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

function parseCreateInput(record: Record<string, unknown>): CreateTellerTransactionInput {
  return {
    typeCode: record.typeCode as TellerTransactionTypeCode,
    currencyCode: typeof record.currencyCode === 'string' ? record.currencyCode : '',
    customerId:
      record.customerId === undefined || record.customerId === null
        ? null
        : parsePositiveIntegerId(record.customerId, 'INVALID_CUSTOMER_ID'),
    amount: parseOptionalString(record.amount),
    quantities: Array.isArray(record.quantities) ? record.quantities : [],
    note: record.note === null ? null : parseOptionalString(record.note),
    transactionDate: parseOptionalString(record.transactionDate),
  };
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
      const { sessionId } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      return { session: ctx.tellerService.getCurrentSession() };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TELLER_SESSION_OPEN, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      const session = ctx.authService.requireSession(sessionId);
      const opened = ctx.tellerService.openSession(session.userId, {
        note: record.note === null ? null : parseOptionalString(record.note),
        openingQuantities: Array.isArray(record.openingQuantities)
          ? (record.openingQuantities as CreateTellerTransactionInput['quantities'])
          : [],
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

  ipcMain.handle(IPC_CHANNELS.TELLER_TRANSACTIONS_CREATE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      const session = ctx.authService.requireSession(sessionId);
      const transaction = ctx.tellerService.createTransaction(session.userId, parseCreateInput(record));
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
        typeCode: parseOptionalString(record.typeCode) as TellerTransactionTypeCode | undefined,
        direction: record.direction === 'IN' || record.direction === 'OUT' ? record.direction : undefined,
        customerId: typeof record.customerId === 'number' ? record.customerId : undefined,
        transactionNumber: parseOptionalString(record.transactionNumber),
        dateFrom: parseOptionalString(record.dateFrom),
        dateTo: parseOptionalString(record.dateTo),
        tellerUserId: typeof record.tellerUserId === 'number' ? record.tellerUserId : undefined,
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

  ipcMain.handle(IPC_CHANNELS.TELLER_DASHBOARD_GET, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      return ctx.tellerService.getDashboard();
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TELLER_TALLY_GET, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      const currencyCode = parseOptionalString(record.currencyCode);
      if (!currencyCode) {
        throw new AppError('INVALID_CURRENCY', 'CURRENCY_REQUIRED');
      }
      return ctx.tellerService.getTally(
        typeof record.tellerSessionId === 'number' ? record.tellerSessionId : undefined,
        currencyCode,
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

  ipcMain.handle(IPC_CHANNELS.TELLER_RECONCILIATION_GET, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      return ctx.tellerService.getReconciliation(
        typeof record.tellerSessionId === 'number' ? record.tellerSessionId : undefined,
      );
    }),
  );
}
