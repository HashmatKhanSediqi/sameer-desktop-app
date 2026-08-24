import { describe, expect, it } from 'vitest';
import { createCustomerTestHarness } from '../helpers/customerHarness';
import { IPC_CHANNELS } from '../../src/shared/types/ipc';
import {
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
} from '../../src/main/services/auth/adminSeedService';

/**
 * Handler-level end-to-end smoke (no Playwright). Covers the critical IPC user path
 * without adding an Electron GUI automation dependency.
 */
describe('critical IPC user-flow smoke', () => {
  it('login → create customer → cash in/out → search → backup → logout', async () => {
    const harness = await createCustomerTestHarness();
    const handlers = new Map<string, (event: unknown, input: unknown) => Promise<unknown>>();

    const { registerAuthHandlers } = await import('../../src/main/ipc/auth.handlers');
    const { registerCustomerHandlers } = await import('../../src/main/ipc/customers.handlers');
    const { registerTransactionHandlers } = await import('../../src/main/ipc/transactions.handlers');
    const { registerBackupHandlers } = await import('../../src/main/ipc/backup.handlers');

    const ipc = {
      handle(channel: string, listener: (event: unknown, input: unknown) => Promise<unknown>) {
        handlers.set(channel, listener);
      },
    };

    registerAuthHandlers(ipc as never, harness.ctx);
    registerCustomerHandlers(ipc as never, harness.ctx);
    registerTransactionHandlers(ipc as never, harness.ctx);
    registerBackupHandlers(ipc as never, harness.ctx);

    const invoke = async (channel: string, input: unknown) => {
      const handler = handlers.get(channel);
      if (!handler) {
        throw new Error(`missing handler ${channel}`);
      }
      return handler({ sender: { send: () => undefined } }, input);
    };

    try {
      const login = (await invoke(IPC_CHANNELS.AUTH_LOGIN, {
        username: DEFAULT_ADMIN_USERNAME,
        password: DEFAULT_ADMIN_PASSWORD,
      })) as { ok: true; data: { sessionId: string } };
      expect(login.ok).toBe(true);
      const sessionId = login.data.sessionId;

      const created = (await invoke(IPC_CHANNELS.CUSTOMERS_CREATE, {
        sessionId,
        name: 'E2E Customer',
        customerNumber: 'E2E-1',
      })) as { ok: true; data: { id: number } };
      expect(created.ok).toBe(true);

      const cashIn = (await invoke(IPC_CHANNELS.TRANSACTIONS_CREATE, {
        sessionId,
        customerId: created.data.id,
        type: 'CASH_IN',
        amount: '100',
        currencyCode: 'AFN',
      })) as { ok: true };
      expect(cashIn.ok).toBe(true);

      const cashOut = (await invoke(IPC_CHANNELS.TRANSACTIONS_CREATE, {
        sessionId,
        customerId: created.data.id,
        type: 'CASH_OUT',
        amount: '25',
        currencyCode: 'AFN',
      })) as { ok: true };
      expect(cashOut.ok).toBe(true);

      const searched = (await invoke(IPC_CHANNELS.CUSTOMERS_SEARCH, {
        sessionId,
        query: 'E2E',
        page: 1,
        pageSize: 25,
        includeAccounting: true,
      })) as { ok: true; data: { customers: unknown[]; totalCount: number } };
      expect(searched.ok).toBe(true);
      expect(searched.data.totalCount).toBeGreaterThan(0);

      const backupPath = `${harness.ctx.paths.backups}/e2e-smoke.cab`;
      const backup = (await invoke(IPC_CHANNELS.BACKUP_CREATE, {
        sessionId,
        destinationPath: backupPath,
      })) as { ok: true; data: { success: boolean } };
      expect(backup.ok).toBe(true);
      expect(backup.data.success).toBe(true);

      const logout = (await invoke(IPC_CHANNELS.AUTH_LOGOUT, { sessionId })) as { ok: true };
      expect(logout.ok).toBe(true);
    } finally {
      harness.cleanup();
    }
  });
});
