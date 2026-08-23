import type { IpcMain } from 'electron';
import { describe, expect, it } from 'vitest';
import { registerSettingsHandlers } from '../../src/main/ipc/settings.handlers';
import { IPC_CHANNELS } from '../../src/shared/types/ipc';
import {
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
} from '../../src/main/services/auth/adminSeedService';
import { createCustomerTestHarness } from '../helpers/customerHarness';

type IpcHandler = (event: unknown, input: unknown) => Promise<unknown>;

function createFakeIpc(): {
  ipc: IpcMain;
  invoke: (channel: string, input?: unknown) => Promise<unknown>;
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

describe('settings IPC handlers', () => {
  it('reads and updates language without a session', async () => {
    const harness = await createCustomerTestHarness();
    const fakeIpc = createFakeIpc();
    registerSettingsHandlers(fakeIpc.ipc, harness.ctx);

    try {
      const initial = (await fakeIpc.invoke(IPC_CHANNELS.SETTINGS_GET)) as {
        ok: true;
        data: { language: string };
      };
      expect(initial.ok).toBe(true);
      expect(initial.data.language).toBe('en');

      const updated = (await fakeIpc.invoke(IPC_CHANNELS.SETTINGS_UPDATE, {
        language: 'fa-AF',
      })) as { ok: true; data: { language: string } };
      expect(updated.ok).toBe(true);
      expect(updated.data.language).toBe('fa-AF');

      const persisted = (await fakeIpc.invoke(IPC_CHANNELS.SETTINGS_GET)) as {
        ok: true;
        data: { language: string };
      };
      expect(persisted.data.language).toBe('fa-AF');
    } finally {
      harness.cleanup();
    }
  });

  it('requires a session to update pagination', async () => {
    const harness = await createCustomerTestHarness();
    const fakeIpc = createFakeIpc();
    registerSettingsHandlers(fakeIpc.ipc, harness.ctx);

    try {
      const missing = (await fakeIpc.invoke(IPC_CHANNELS.SETTINGS_UPDATE, {
        paginationEnabled: false,
      })) as { ok: false; errorCode: string };
      expect(missing.ok).toBe(false);
      expect(missing.errorCode).toBe('NOT_AUTHENTICATED');

      const login = await harness.authService.login(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);
      const updated = (await fakeIpc.invoke(IPC_CHANNELS.SETTINGS_UPDATE, {
        sessionId: login.sessionId,
        paginationEnabled: false,
        paginationPageSize: 25,
      })) as { ok: true; data: { paginationEnabled: boolean; paginationPageSize: number } };
      expect(updated.ok).toBe(true);
      expect(updated.data.paginationEnabled).toBe(false);
      expect(updated.data.paginationPageSize).toBe(25);
    } finally {
      harness.cleanup();
    }
  });

  it('rejects invalid language values', async () => {
    const harness = await createCustomerTestHarness();
    const fakeIpc = createFakeIpc();
    registerSettingsHandlers(fakeIpc.ipc, harness.ctx);

    try {
      const result = (await fakeIpc.invoke(IPC_CHANNELS.SETTINGS_UPDATE, {
        language: 'de',
      })) as { ok: false; errorCode: string };
      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe('VALIDATION_ERROR');
    } finally {
      harness.cleanup();
    }
  });
});
