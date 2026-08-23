import type { IpcMain } from 'electron';
import { describe, expect, it } from 'vitest';
import { registerTransactionHandlers } from '../../src/main/ipc/transactions.handlers';
import { registerCustomerHandlers } from '../../src/main/ipc/customers.handlers';
import { IPC_CHANNELS } from '../../src/shared/types/ipc';
import {
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
} from '../../src/main/services/auth/adminSeedService';
import { createCustomerTestHarness } from '../helpers/customerHarness';

type IpcHandler = (event: unknown, input: unknown) => Promise<unknown>;

function createFakeIpc(): {
  ipc: IpcMain;
  invoke: (channel: string, input: unknown) => Promise<unknown>;
} {
  const handlers = new Map<string, IpcHandler>();
  return {
    ipc: {
      handle(channel: string, listener: IpcHandler) {
        handlers.set(channel, listener);
      },
    } as unknown as IpcMain,
    invoke(channel, input) {
      const handler = handlers.get(channel);
      if (!handler) {
        throw new Error(`No handler registered for ${channel}`);
      }
      return handler({}, input);
    },
  };
}

describe('transaction IPC handlers', () => {
  it('rejects unauthenticated and invalid sessions', async () => {
    const harness = await createCustomerTestHarness();
    const fakeIpc = createFakeIpc();
    registerTransactionHandlers(fakeIpc.ipc, harness.ctx);

    try {
      const missing = (await fakeIpc.invoke(IPC_CHANNELS.TRANSACTIONS_LIST, {
        customerId: 1,
      })) as { ok: false; errorCode: string };
      expect(missing.ok).toBe(false);
      expect(missing.errorCode).toBe('NOT_AUTHENTICATED');

      const invalid = (await fakeIpc.invoke(IPC_CHANNELS.TRANSACTIONS_LIST, {
        sessionId: 'expired',
        customerId: 1,
      })) as { ok: false; errorCode: string };
      expect(invalid.ok).toBe(false);
      expect(invalid.errorCode).toBe('SESSION_EXPIRED');
    } finally {
      harness.cleanup();
    }
  });

  it('allows authenticated create, list, summary, update, and delete', async () => {
    const harness = await createCustomerTestHarness();
    const fakeIpc = createFakeIpc();
    registerCustomerHandlers(fakeIpc.ipc, harness.ctx);
    registerTransactionHandlers(fakeIpc.ipc, harness.ctx);

    try {
      const login = await harness.authService.login(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);
      const customer = harness.customerService.create({ name: 'Ahmad' });

      const created = (await fakeIpc.invoke(IPC_CHANNELS.TRANSACTIONS_CREATE, {
        sessionId: login.sessionId,
        customerId: customer.id,
        type: 'CASH_IN',
        amount: '1000',
        currencyCode: 'afn',
      })) as { ok: true; data: { transactionId: number; transaction: { isEdited: boolean } } };
      expect(created.ok).toBe(true);
      expect(created.data.transaction.isEdited).toBe(false);

      const listed = (await fakeIpc.invoke(IPC_CHANNELS.TRANSACTIONS_LIST, {
        sessionId: login.sessionId,
        customerId: customer.id,
      })) as { ok: true; data: { transactions: Array<{ amount: string }> } };
      expect(listed.ok).toBe(true);
      expect(listed.data.transactions).toHaveLength(1);

      const summary = (await fakeIpc.invoke(IPC_CHANNELS.TRANSACTIONS_SUMMARY, {
        sessionId: login.sessionId,
        customerId: customer.id,
      })) as { ok: true; data: { currencies: Array<{ currencyCode: string; balance: string }> } };
      expect(summary.data.currencies.find((item) => item.currencyCode === 'AFN')?.balance).toBe('1000.0000');

      const updated = (await fakeIpc.invoke(IPC_CHANNELS.TRANSACTIONS_UPDATE, {
        sessionId: login.sessionId,
        transactionId: created.data.transactionId,
        type: 'CASH_OUT',
        amount: '200',
        currencyCode: 'AFN',
      })) as { ok: true; data: { transaction: { isEdited: boolean; type: string } } };
      expect(updated.data.transaction.isEdited).toBe(true);
      expect(updated.data.transaction.type).toBe('CASH_OUT');

      const customers = (await fakeIpc.invoke(IPC_CHANNELS.CUSTOMERS_LIST, {
        sessionId: login.sessionId,
      })) as { ok: true; data: { customers: Array<{ balances: Record<string, string> }>; totals: Array<{ currencyCode: string; balance: string }> } };
      expect(customers.data.customers[0]?.balances.AFN).toBe('-200.0000');

      const deleted = (await fakeIpc.invoke(IPC_CHANNELS.TRANSACTIONS_DELETE, {
        sessionId: login.sessionId,
        transactionId: created.data.transactionId,
      })) as { ok: true };
      expect(deleted.ok).toBe(true);
    } finally {
      harness.cleanup();
    }
  });

  it('validates IPC input and does not accept invalid ids, types, or amounts', async () => {
    const harness = await createCustomerTestHarness();
    const fakeIpc = createFakeIpc();
    registerTransactionHandlers(fakeIpc.ipc, harness.ctx);

    try {
      const login = await harness.authService.login(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);
      const customer = harness.customerService.create({ name: 'Ahmad' });

      const badCustomer = (await fakeIpc.invoke(IPC_CHANNELS.TRANSACTIONS_CREATE, {
        sessionId: login.sessionId,
        customerId: '1 OR 1=1',
        type: 'CASH_IN',
        amount: '10',
        currencyCode: 'AFN',
      })) as { ok: false; errorCode: string; message?: string };
      expect(badCustomer.ok).toBe(false);
      expect(badCustomer.message).not.toMatch(/SELECT/i);

      const badType = (await fakeIpc.invoke(IPC_CHANNELS.TRANSACTIONS_CREATE, {
        sessionId: login.sessionId,
        customerId: customer.id,
        type: 'TRANSFER',
        amount: '10',
        currencyCode: 'AFN',
      })) as { ok: false; errorCode: string };
      expect(badType.errorCode).toBe('INVALID_TRANSACTION_TYPE');

      const badAmount = (await fakeIpc.invoke(IPC_CHANNELS.TRANSACTIONS_CREATE, {
        sessionId: login.sessionId,
        customerId: customer.id,
        type: 'CASH_IN',
        amount: '0',
        currencyCode: 'AFN',
      })) as { ok: false; message?: string };
      expect(badAmount.ok).toBe(false);
      expect(badAmount.message).toBe('AMOUNT_INVALID');

      const badTxn = (await fakeIpc.invoke(IPC_CHANNELS.TRANSACTIONS_UPDATE, {
        sessionId: login.sessionId,
        transactionId: 999,
        type: 'CASH_IN',
        amount: '10',
        currencyCode: 'AFN',
      })) as { ok: false; errorCode: string };
      expect(badTxn.errorCode).toBe('TRANSACTION_NOT_FOUND');
    } finally {
      harness.cleanup();
    }
  });

  it('creates and deactivates currencies for authenticated sessions', async () => {
    const harness = await createCustomerTestHarness();
    const fakeIpc = createFakeIpc();
    registerTransactionHandlers(fakeIpc.ipc, harness.ctx);

    try {
      const login = await harness.authService.login(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);

      const created = (await fakeIpc.invoke(IPC_CHANNELS.CURRENCIES_CREATE, {
        sessionId: login.sessionId,
        code: 'gbp',
        symbol: '£',
      })) as { ok: true; data: { currency: { code: string; isActive: boolean } } };
      expect(created.ok).toBe(true);
      expect(created.data.currency.code).toBe('GBP');

      const listed = (await fakeIpc.invoke(IPC_CHANNELS.CURRENCIES_LIST, {
        sessionId: login.sessionId,
        includeInactive: true,
      })) as { ok: true; data: { currencies: Array<{ code: string }> } };
      expect(listed.data.currencies.some((currency) => currency.code === 'GBP')).toBe(true);

      const deactivated = (await fakeIpc.invoke(IPC_CHANNELS.CURRENCIES_DEACTIVATE, {
        sessionId: login.sessionId,
        code: 'GBP',
      })) as { ok: true; data: { currency: { isActive: boolean } } };
      expect(deactivated.data.currency.isActive).toBe(false);
    } finally {
      harness.cleanup();
    }
  });
});
