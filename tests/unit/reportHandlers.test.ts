import type { IpcMain } from 'electron';
import { describe, expect, it } from 'vitest';
import { registerReportHandlers } from '../../src/main/ipc/reports.handlers';
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
      return handler({ sender: { send: () => undefined } }, input);
    },
  };
}

describe('report IPC handlers', () => {
  it('rejects unauthenticated and invalid sessions', async () => {
    const harness = await createCustomerTestHarness();
    const fakeIpc = createFakeIpc();
    registerReportHandlers(fakeIpc.ipc, harness.ctx);

    try {
      const missing = (await fakeIpc.invoke(IPC_CHANNELS.REPORTS_GENERATE, {
        type: 'all_customers',
        format: 'xlsx',
        language: 'en',
      })) as { ok: false; errorCode: string };
      expect(missing.ok).toBe(false);
      expect(missing.errorCode).toBe('NOT_AUTHENTICATED');

      const invalid = (await fakeIpc.invoke(IPC_CHANNELS.REPORTS_GENERATE, {
        sessionId: 'expired',
        type: 'all_customers',
        format: 'xlsx',
        language: 'en',
      })) as { ok: false; errorCode: string };
      expect(invalid.ok).toBe(false);
      expect(invalid.errorCode).toBe('SESSION_EXPIRED');
    } finally {
      harness.cleanup();
    }
  });

  it('generates an authenticated all-customers Excel report', async () => {
    const harness = await createCustomerTestHarness();
    const fakeIpc = createFakeIpc();
    registerReportHandlers(fakeIpc.ipc, harness.ctx);

    try {
      const login = await harness.authService.login(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);
      harness.customerService.create({ name: 'Ahmad' });

      const result = (await fakeIpc.invoke(IPC_CHANNELS.REPORTS_GENERATE, {
        sessionId: login.sessionId,
        type: 'all_customers',
        format: 'xlsx',
        language: 'en',
      })) as { ok: true; data: { filePath: string; fileName: string } };

      expect(result.ok).toBe(true);
      expect(result.data.fileName.endsWith('.xlsx')).toBe(true);
      expect(result.data.filePath.length).toBeGreaterThan(0);
    } finally {
      harness.cleanup();
    }
  });

  it('rejects invalid report input', async () => {
    const harness = await createCustomerTestHarness();
    const fakeIpc = createFakeIpc();
    registerReportHandlers(fakeIpc.ipc, harness.ctx);

    try {
      const login = await harness.authService.login(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);
      const result = (await fakeIpc.invoke(IPC_CHANNELS.REPORTS_GENERATE, {
        sessionId: login.sessionId,
        type: 'not-a-report',
        format: 'pdf',
        language: 'en',
      })) as { ok: false; errorCode: string };
      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe('VALIDATION_ERROR');
    } finally {
      harness.cleanup();
    }
  });

  it('generates an authenticated individual customer PDF', async () => {
    const harness = await createCustomerTestHarness();
    const fakeIpc = createFakeIpc();
    registerReportHandlers(fakeIpc.ipc, harness.ctx);

    try {
      const login = await harness.authService.login(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);
      const customer = harness.customerService.create({ name: 'Noor', customerNumber: 'N-9' });

      const result = (await fakeIpc.invoke(IPC_CHANNELS.REPORTS_GENERATE, {
        sessionId: login.sessionId,
        type: 'customer',
        format: 'pdf',
        language: 'en',
        customerId: customer.id,
      })) as { ok: true; data: { filePath: string; fileName: string } };

      expect(result.ok).toBe(true);
      expect(result.data.fileName).toMatch(/^FMT_Customer_Noor_N-9_\d{4}-\d{2}-\d{2}\.pdf$/);
      expect(result.data.filePath.length).toBeGreaterThan(0);
    } finally {
      harness.cleanup();
    }
  });
});
