import type { IpcMain } from 'electron';
import { describe, expect, it } from 'vitest';
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

describe('customer IPC handlers', () => {
  it('rejects unauthenticated and invalid sessions', async () => {
    const harness = await createCustomerTestHarness();
    const fakeIpc = createFakeIpc();
    registerCustomerHandlers(fakeIpc.ipc, harness.ctx);

    try {
      const missing = (await fakeIpc.invoke(IPC_CHANNELS.CUSTOMERS_LIST, {})) as {
        ok: false;
        errorCode: string;
      };
      expect(missing.ok).toBe(false);
      expect(missing.errorCode).toBe('NOT_AUTHENTICATED');

      const invalid = (await fakeIpc.invoke(IPC_CHANNELS.CUSTOMERS_LIST, {
        sessionId: 'not-a-session',
      })) as { ok: false; errorCode: string };
      expect(invalid.ok).toBe(false);
      expect(invalid.errorCode).toBe('SESSION_EXPIRED');
    } finally {
      harness.cleanup();
    }
  });

  it('allows authenticated create, list, search, get, update, and delete', async () => {
    const harness = await createCustomerTestHarness();
    const fakeIpc = createFakeIpc();
    registerCustomerHandlers(fakeIpc.ipc, harness.ctx);

    try {
      const login = await harness.authService.login(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);

      const created = (await fakeIpc.invoke(IPC_CHANNELS.CUSTOMERS_CREATE, {
        sessionId: login.sessionId,
        name: 'Ahmad',
        customerNumber: 'C-77',
      })) as { ok: true; data: { id: number; name: string } };
      expect(created.ok).toBe(true);
      expect(created.data.name).toBe('Ahmad');

      const listed = (await fakeIpc.invoke(IPC_CHANNELS.CUSTOMERS_LIST, {
        sessionId: login.sessionId,
      })) as { ok: true; data: { customers: Array<{ id: number }> } };
      expect(listed.ok).toBe(true);
      expect(listed.data.customers).toHaveLength(1);

      const searched = (await fakeIpc.invoke(IPC_CHANNELS.CUSTOMERS_SEARCH, {
        sessionId: login.sessionId,
        query: 'C-77',
      })) as { ok: true; data: { customers: Array<{ customerNumber: string | null }> } };
      expect(searched.ok).toBe(true);
      expect(searched.data.customers[0]?.customerNumber).toBe('C-77');

      const fetched = (await fakeIpc.invoke(IPC_CHANNELS.CUSTOMERS_GET, {
        sessionId: login.sessionId,
        id: created.data.id,
      })) as { ok: true; data: { id: number; photoFilename?: unknown } };
      expect(fetched.ok).toBe(true);
      expect(fetched.data.id).toBe(created.data.id);
      expect(fetched.data).not.toHaveProperty('photoFilename');
      expect(fetched.data).not.toHaveProperty('photo_filename');

      const updated = (await fakeIpc.invoke(IPC_CHANNELS.CUSTOMERS_UPDATE, {
        sessionId: login.sessionId,
        id: created.data.id,
        name: 'Ahmad Updated',
      })) as { ok: true; data: { name: string } };
      expect(updated.ok).toBe(true);
      expect(updated.data.name).toBe('Ahmad Updated');

      const deleted = (await fakeIpc.invoke(IPC_CHANNELS.CUSTOMERS_DELETE, {
        sessionId: login.sessionId,
        id: created.data.id,
      })) as { ok: true; data: { success: true } };
      expect(deleted.ok).toBe(true);
    } finally {
      harness.cleanup();
    }
  });

  it('validates IPC input and never returns database internals', async () => {
    const harness = await createCustomerTestHarness();
    const fakeIpc = createFakeIpc();
    registerCustomerHandlers(fakeIpc.ipc, harness.ctx);

    try {
      const login = await harness.authService.login(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);

      const invalidId = (await fakeIpc.invoke(IPC_CHANNELS.CUSTOMERS_GET, {
        sessionId: login.sessionId,
        id: '1 OR 1=1',
      })) as { ok: false; errorCode: string; message?: string };
      expect(invalidId.ok).toBe(false);
      expect(invalidId.errorCode).toBe('VALIDATION_ERROR');
      expect(invalidId.message).not.toMatch(/SELECT/i);

      const invalidSearch = (await fakeIpc.invoke(IPC_CHANNELS.CUSTOMERS_SEARCH, {
        sessionId: login.sessionId,
        query: 42,
      })) as { ok: false; errorCode: string };
      expect(invalidSearch.ok).toBe(false);
    } finally {
      harness.cleanup();
    }
  });
});
