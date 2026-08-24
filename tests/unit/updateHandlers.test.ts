import type { IpcMain } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { registerUpdateHandlers } from '../../src/main/ipc/update.handlers';
import { UpdateService } from '../../src/main/services/update/updateService';
import { IPC_CHANNELS } from '../../src/shared/types/ipc';
import {
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
} from '../../src/main/services/auth/adminSeedService';
import { createCustomerTestHarness } from '../helpers/customerHarness';
import type { BackupService } from '../../src/main/services/backup/backupService';
import type { ElectronUpdaterAdapter, UpdateCheckResultLike } from '../../src/main/services/update/electronUpdaterAdapter';
import { EventEmitter } from 'node:events';
import type { Logger } from '../../src/main/utils/logger';

type IpcHandler = (event: unknown, input: unknown) => Promise<unknown>;

class MockUpdater extends EventEmitter implements ElectronUpdaterAdapter {
  autoDownload = true;
  allowDowngrade = true;
  autoInstallOnAppQuit = true;
  logger: unknown = null;
  checkImpl: () => Promise<UpdateCheckResultLike | null> = async () => ({
    updateInfo: { version: '1.0.0' },
  });

  async checkForUpdates(): Promise<UpdateCheckResultLike | null> {
    return this.checkImpl();
  }

  async downloadUpdate(): Promise<string[]> {
    return [];
  }

  quitAndInstall(): void {}
}

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

describe('update IPC handlers', () => {
  it('requires an authenticated session', async () => {
    const harness = await createCustomerTestHarness();
    harness.ctx.updateService = new UpdateService({
      currentVersion: '1.0.0',
      packaged: true,
      logger: harness.testDb.logger as unknown as Logger,
      backupService: harness.backupService,
      updater: new MockUpdater(),
    });
    const fakeIpc = createFakeIpc();
    registerUpdateHandlers(fakeIpc.ipc, harness.ctx);

    try {
      const missing = (await fakeIpc.invoke(IPC_CHANNELS.UPDATE_CHECK, {})) as {
        ok: false;
        errorCode: string;
      };
      expect(missing.ok).toBe(false);
      expect(missing.errorCode).toBe('NOT_AUTHENTICATED');
    } finally {
      harness.cleanup();
    }
  });

  it('returns upToDate and available snapshots through IPC', async () => {
    const harness = await createCustomerTestHarness();
    const updater = new MockUpdater();
    harness.ctx.updateService = new UpdateService({
      currentVersion: '1.0.0',
      packaged: true,
      logger: harness.testDb.logger as unknown as Logger,
      backupService: {
        createPreUpdateBackup: vi.fn(async () => ({ created: true, filePath: 'x.cab' })),
      } as unknown as BackupService,
      updater,
    });
    const fakeIpc = createFakeIpc();
    registerUpdateHandlers(fakeIpc.ipc, harness.ctx);

    try {
      const login = await harness.authService.login(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);

      const current = (await fakeIpc.invoke(IPC_CHANNELS.UPDATE_GET_STATUS, {
        sessionId: login.sessionId,
      })) as { ok: true; data: { state: string; provider: { owner: string } } };
      expect(current.ok).toBe(true);
      expect(current.data.provider.owner).toBe('HashmatKhanSediqi');

      updater.checkImpl = async () => ({ updateInfo: { version: '1.0.0' } });
      const upToDate = (await fakeIpc.invoke(IPC_CHANNELS.UPDATE_CHECK, {
        sessionId: login.sessionId,
      })) as { ok: boolean; errorCode?: string; data?: { state: string } };
      expect(upToDate).toMatchObject({ ok: true, data: { state: 'upToDate' } });

      updater.checkImpl = async () => ({ updateInfo: { version: '1.0.2' } });
      const available = (await fakeIpc.invoke(IPC_CHANNELS.UPDATE_CHECK, {
        sessionId: login.sessionId,
      })) as { ok: true; data: { state: string; availableVersion: string } };
      expect(available.ok).toBe(true);
      expect(available.data.state).toBe('available');
      expect(available.data.availableVersion).toBe('1.0.2');
    } finally {
      harness.cleanup();
    }
  });

  it('returns the error snapshot instead of crashing when GitHub is unreachable', async () => {
    const harness = await createCustomerTestHarness();
    const updater = new MockUpdater();
    updater.checkImpl = async () => {
      throw new Error('ENOTFOUND github.com');
    };
    harness.ctx.updateService = new UpdateService({
      currentVersion: '1.0.0',
      packaged: true,
      logger: harness.testDb.logger as unknown as Logger,
      backupService: harness.backupService,
      updater,
    });
    const fakeIpc = createFakeIpc();
    registerUpdateHandlers(fakeIpc.ipc, harness.ctx);

    try {
      const login = await harness.authService.login(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);
      const failed = (await fakeIpc.invoke(IPC_CHANNELS.UPDATE_CHECK, {
        sessionId: login.sessionId,
      })) as { ok: true; data: { state: string; errorCode: string } };
      expect(failed.ok).toBe(true);
      expect(failed.data.state).toBe('error');
      expect(failed.data.errorCode).toBe('UPDATE_CHECK_FAILED');
    } finally {
      harness.cleanup();
    }
  });
});
