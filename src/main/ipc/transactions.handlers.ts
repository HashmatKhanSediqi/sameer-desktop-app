import type { IpcMain } from 'electron';
import type { ApplicationContext } from '../services/applicationContext';
import { AppError, wrapIpcHandler } from '../utils/errors';
import { IPC_CHANNELS } from '@shared/types/ipc';
import type { CreateTransactionInput, UpdateTransactionInput } from '@shared/types/transaction';
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
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'INVALID_REQUEST');
  }
  return value;
}

function parseCreateInput(record: Record<string, unknown>): CreateTransactionInput {
  return {
    customerId: record.customerId as number,
    type: record.type as CreateTransactionInput['type'],
    amount: record.amount as string,
    currencyCode: record.currencyCode as string,
    transactionDate: parseOptionalString(record.transactionDate),
    note: record.note === null ? null : parseOptionalString(record.note),
  };
}

function parseUpdateInput(record: Record<string, unknown>): UpdateTransactionInput {
  const transactionId = record.transactionId ?? record.id;
  return {
    id: transactionId as number,
    type: record.type as UpdateTransactionInput['type'],
    amount: record.amount as string,
    currencyCode: record.currencyCode as string,
    transactionDate: parseOptionalString(record.transactionDate),
    note: record.note === null ? null : parseOptionalString(record.note),
  };
}

export function registerTransactionHandlers(ipcMain: IpcMain, ctx: ApplicationContext): void {
  ipcMain.handle(IPC_CHANNELS.CURRENCIES_LIST, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      const includeInactive = record.includeInactive === true;
      return {
        currencies: includeInactive ? ctx.currencyService.listAll() : ctx.currencyService.listActive(),
      };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.CURRENCIES_CREATE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      const currency = ctx.currencyService.create({
        code: record.code as string,
        name: typeof record.name === 'string' ? record.name : undefined,
        symbol: typeof record.symbol === 'string' ? record.symbol : undefined,
        sortOrder: typeof record.sortOrder === 'number' ? record.sortOrder : undefined,
      });
      return { currency };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.CURRENCIES_DEACTIVATE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      if (typeof record.code !== 'string') {
        throw new AppError('VALIDATION_ERROR', 'CURRENCY_CODE_INVALID');
      }
      const currency = ctx.currencyService.deactivate(record.code);
      return { currency };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.CURRENCIES_REACTIVATE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      if (typeof record.code !== 'string') {
        throw new AppError('VALIDATION_ERROR', 'CURRENCY_CODE_INVALID');
      }
      const currency = ctx.currencyService.reactivate(record.code);
      return { currency };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.CURRENCIES_DELETE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      if (typeof record.code !== 'string') {
        throw new AppError('VALIDATION_ERROR', 'CURRENCY_CODE_INVALID');
      }
      return ctx.currencyService.remove(record.code);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.CURRENCIES_DENOMINATIONS_LIST, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      if (typeof record.currencyCode !== 'string') {
        throw new AppError('VALIDATION_ERROR', 'CURRENCY_CODE_INVALID');
      }
      return {
        denominations: ctx.currencyService.listDenominations(
          record.currencyCode,
          record.includeInactive === true,
        ),
      };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.CURRENCIES_DENOMINATIONS_CREATE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      if (typeof record.currencyCode !== 'string') {
        throw new AppError('VALIDATION_ERROR', 'CURRENCY_CODE_INVALID');
      }
      const denomination = ctx.currencyService.createDenomination({
        currencyCode: record.currencyCode,
        value: typeof record.value === 'string' ? record.value : String(record.value ?? ''),
      });
      return { denomination };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.CURRENCIES_DENOMINATIONS_DEACTIVATE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      const denomination = ctx.currencyService.deactivateDenomination(
        parsePositiveIntegerId(record.id, 'TELLER_DENOMINATION_INVALID'),
      );
      return { denomination };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.CURRENCIES_DENOMINATIONS_REACTIVATE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      const denomination = ctx.currencyService.reactivateDenomination(
        parsePositiveIntegerId(record.id, 'TELLER_DENOMINATION_INVALID'),
      );
      return { denomination };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.CURRENCIES_DENOMINATIONS_DELETE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      return ctx.currencyService.removeDenomination(
        parsePositiveIntegerId(record.id, 'TELLER_DENOMINATION_INVALID'),
      );
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TELLER_CURRENCIES_LIST, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      const includeInactive = record.includeInactive === true;
      return {
        currencies: includeInactive ? ctx.tellerCurrencyService.listAll() : ctx.tellerCurrencyService.listActive(),
      };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TELLER_CURRENCIES_CREATE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      const currency = ctx.tellerCurrencyService.create({
        code: record.code as string,
        name: typeof record.name === 'string' ? record.name : undefined,
        symbol: typeof record.symbol === 'string' ? record.symbol : undefined,
        sortOrder: typeof record.sortOrder === 'number' ? record.sortOrder : undefined,
      });
      return { currency };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TELLER_CURRENCIES_DEACTIVATE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      if (typeof record.code !== 'string') {
        throw new AppError('VALIDATION_ERROR', 'CURRENCY_CODE_INVALID');
      }
      const currency = ctx.tellerCurrencyService.deactivate(record.code);
      return { currency };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TELLER_CURRENCIES_REACTIVATE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      if (typeof record.code !== 'string') {
        throw new AppError('VALIDATION_ERROR', 'CURRENCY_CODE_INVALID');
      }
      const currency = ctx.tellerCurrencyService.reactivate(record.code);
      return { currency };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TELLER_CURRENCIES_DELETE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      if (typeof record.code !== 'string') {
        throw new AppError('VALIDATION_ERROR', 'CURRENCY_CODE_INVALID');
      }
      return ctx.tellerCurrencyService.remove(record.code);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TELLER_CURRENCIES_DENOMINATIONS_LIST, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      if (typeof record.currencyCode !== 'string') {
        throw new AppError('VALIDATION_ERROR', 'CURRENCY_CODE_INVALID');
      }
      return {
        denominations: ctx.tellerCurrencyService.listDenominations(
          record.currencyCode,
          record.includeInactive === true,
        ),
      };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TELLER_CURRENCIES_DENOMINATIONS_CREATE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      if (typeof record.currencyCode !== 'string') {
        throw new AppError('VALIDATION_ERROR', 'CURRENCY_CODE_INVALID');
      }
      const denomination = ctx.tellerCurrencyService.createDenomination({
        currencyCode: record.currencyCode,
        value: typeof record.value === 'string' ? record.value : String(record.value ?? ''),
      });
      return { denomination };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TELLER_CURRENCIES_DENOMINATIONS_DEACTIVATE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      const denomination = ctx.tellerCurrencyService.deactivateDenomination(
        parsePositiveIntegerId(record.id, 'TELLER_DENOMINATION_INVALID'),
      );
      return { denomination };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TELLER_CURRENCIES_DENOMINATIONS_REACTIVATE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      const denomination = ctx.tellerCurrencyService.reactivateDenomination(
        parsePositiveIntegerId(record.id, 'TELLER_DENOMINATION_INVALID'),
      );
      return { denomination };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TELLER_CURRENCIES_DENOMINATIONS_DELETE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      return ctx.tellerCurrencyService.removeDenomination(
        parsePositiveIntegerId(record.id, 'TELLER_DENOMINATION_INVALID'),
      );
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TRANSACTIONS_LIST, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      return ctx.transactionService.list({
        customerId: record.customerId as number,
        page: typeof record.page === 'number' ? record.page : undefined,
        pageSize: typeof record.pageSize === 'number' ? record.pageSize : undefined,
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TRANSACTIONS_SUMMARY, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      return ctx.transactionService.getCustomerSummary(record.customerId);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TRANSACTIONS_CREATE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      const created = ctx.transactionService.create(parseCreateInput(record));
      return { success: true as const, transactionId: created.id, transaction: created };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TRANSACTIONS_UPDATE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      const updated = ctx.transactionService.update(parseUpdateInput(record));
      return { success: true as const, transaction: updated };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TRANSACTIONS_DELETE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      return ctx.transactionService.delete(record.transactionId ?? record.id);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.TRANSFERS_CREATE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      return ctx.transactionService.transfer({
        fromCustomerId: record.fromCustomerId as number,
        toCustomerId: record.toCustomerId as number,
        currencyCode: record.currencyCode as string,
        amount: record.amount as string,
        note: record.note === null ? null : parseOptionalString(record.note),
        transactionDate: parseOptionalString(record.transactionDate),
      });
    }),
  );
}
