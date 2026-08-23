import type { IpcMain } from 'electron';
import type { ApplicationContext } from '../services/applicationContext';
import { AppError, wrapIpcHandler } from '../utils/errors';
import { IPC_CHANNELS } from '@shared/types/ipc';
import type { CreateCustomerInput, CustomerIdentity, CustomerListItem, UpdateCustomerInput } from '@shared/types/customer';

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

function parseOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'INVALID_REQUEST');
  }
  return value;
}

function parseCreateInput(record: Record<string, unknown>): CreateCustomerInput {
  return {
    name: parseOptionalString(record.name),
    customerNumber: parseOptionalString(record.customerNumber),
    photoBase64: parseOptionalString(record.photoBase64),
  };
}

function parseUpdateInput(record: Record<string, unknown>): UpdateCustomerInput {
  if (typeof record.id !== 'number') {
    throw new AppError('VALIDATION_ERROR', 'INVALID_CUSTOMER_ID');
  }

  const input: UpdateCustomerInput = { id: record.id };

  if ('name' in record) {
    input.name = parseOptionalString(record.name);
  }

  if ('customerNumber' in record) {
    input.customerNumber = parseOptionalString(record.customerNumber);
  }

  if ('photoBase64' in record) {
    input.photoBase64 = parseOptionalString(record.photoBase64);
  }

  if ('removePhoto' in record) {
    if (typeof record.removePhoto !== 'boolean') {
      throw new AppError('VALIDATION_ERROR', 'INVALID_REQUEST');
    }
    input.removePhoto = record.removePhoto;
  }

  return input;
}

function withAccounting(
  ctx: ApplicationContext,
  customers: CustomerIdentity[],
): { customers: CustomerListItem[]; totals: ReturnType<ApplicationContext['transactionService']['getGlobalTotals']> } {
  const accounting = ctx.transactionService.getListAccounting(customers.map((customer) => customer.id));
  return {
    customers: customers.map((customer) => {
      const stats = accounting.get(customer.id) ?? {
        balances: {},
        cashInCount: 0,
        cashOutCount: 0,
      };
      return {
        ...customer,
        balances: stats.balances,
        cashInCount: stats.cashInCount,
        cashOutCount: stats.cashOutCount,
      };
    }),
    totals: ctx.transactionService.getGlobalTotals(),
  };
}

export function registerCustomerHandlers(ipcMain: IpcMain, ctx: ApplicationContext): void {
  ipcMain.handle(IPC_CHANNELS.CUSTOMERS_LIST, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      return withAccounting(ctx, ctx.customerService.list());
    }),
  );

  ipcMain.handle(IPC_CHANNELS.CUSTOMERS_SEARCH, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);

      if (typeof record.query !== 'string') {
        throw new AppError('VALIDATION_ERROR', 'INVALID_REQUEST');
      }

      return withAccounting(ctx, ctx.customerService.search(record.query));
    }),
  );

  ipcMain.handle(IPC_CHANNELS.CUSTOMERS_GET, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      return ctx.customerService.getById(record.id);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.CUSTOMERS_CREATE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      return ctx.customerService.create(parseCreateInput(record));
    }),
  );

  ipcMain.handle(IPC_CHANNELS.CUSTOMERS_UPDATE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      return ctx.customerService.update(parseUpdateInput(record));
    }),
  );

  ipcMain.handle(IPC_CHANNELS.CUSTOMERS_DELETE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      return ctx.customerService.delete(record.id);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.CUSTOMERS_GET_PHOTO, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      return ctx.customerService.getPhoto(record.id);
    }),
  );
}
