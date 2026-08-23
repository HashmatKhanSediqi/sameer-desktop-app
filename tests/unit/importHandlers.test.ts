import type { IpcMain } from 'electron';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { registerImportHandlers } from '../../src/main/ipc/import.handlers';
import { IPC_CHANNELS } from '../../src/shared/types/ipc';
import {
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
} from '../../src/main/services/auth/adminSeedService';
import { createCustomerTestHarness } from '../helpers/customerHarness';
import { writeImportWorkbook } from '../helpers/importWorkbook';

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
      return handler({ sender: { send: () => undefined } }, input);
    },
  };
}

describe('import IPC handlers', () => {
  it('rejects unauthenticated and invalid sessions', async () => {
    const harness = await createCustomerTestHarness();
    const fakeIpc = createFakeIpc();
    registerImportHandlers(fakeIpc.ipc, harness.ctx);

    try {
      const missing = (await fakeIpc.invoke(IPC_CHANNELS.IMPORT_PARSE, {})) as {
        ok: false;
        errorCode: string;
      };
      expect(missing.ok).toBe(false);
      expect(missing.errorCode).toBe('NOT_AUTHENTICATED');

      const invalid = (await fakeIpc.invoke(IPC_CHANNELS.IMPORT_COMMIT, {
        sessionId: 'expired',
        validCustomers: [],
        validTransactions: [],
      })) as { ok: false; errorCode: string };
      expect(invalid.ok).toBe(false);
      expect(invalid.errorCode).toBe('SESSION_EXPIRED');

      const templateDenied = (await fakeIpc.invoke(IPC_CHANNELS.IMPORT_DOWNLOAD_TEMPLATE, {
        sessionId: 'expired',
      })) as { ok: false; errorCode: string };
      expect(templateDenied.ok).toBe(false);
      expect(templateDenied.errorCode).toBe('SESSION_EXPIRED');
    } finally {
      harness.cleanup();
    }
  });

  it('parses and commits through authenticated IPC', async () => {
    const harness = await createCustomerTestHarness();
    const fakeIpc = createFakeIpc();
    registerImportHandlers(fakeIpc.ipc, harness.ctx);

    try {
      const login = await harness.authService.login(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);
      const filePath = join(harness.testDb.dbPath, '..', 'ipc-import.xlsx');
      await writeImportWorkbook(filePath, {
        transactions: [['C-700', 'IPC User', 'CASH_IN', 'USD', '8.25', '2025-06-01', 'via ipc']],
      });

      const parsed = (await fakeIpc.invoke(IPC_CHANNELS.IMPORT_PARSE, {
        sessionId: login.sessionId,
        filePath,
      })) as {
        ok: true;
        data: {
          success: boolean;
          validCustomers: unknown[];
          validTransactions: unknown[];
          summary: { validCount: number };
        };
      };

      expect(parsed.ok).toBe(true);
      expect(parsed.data.success).toBe(true);
      expect(parsed.data.summary.validCount).toBe(1);

      const committed = (await fakeIpc.invoke(IPC_CHANNELS.IMPORT_COMMIT, {
        sessionId: login.sessionId,
        validCustomers: parsed.data.validCustomers,
        validTransactions: parsed.data.validTransactions,
      })) as { ok: true; data: { transactionsImported: number; customersCreated: number } };

      expect(committed.ok).toBe(true);
      expect(committed.data.transactionsImported).toBe(1);
      expect(committed.data.customersCreated).toBe(1);
    } finally {
      harness.cleanup();
    }
  });
});
