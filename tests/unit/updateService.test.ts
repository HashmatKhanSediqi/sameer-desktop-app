import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  UPDATE_AUTO_CHECK_INTERVAL_MS,
  UPDATE_GITHUB_OWNER,
  UPDATE_GITHUB_REPO,
  getUpdatePublishConfig,
} from '../../src/shared/constants/updateConfig';
import type { UpdateProgress } from '../../src/shared/types/update';
import type { BackupService } from '../../src/main/services/backup/backupService';
import {
  type ElectronUpdaterAdapter,
  type UpdateCheckResultLike,
} from '../../src/main/services/update/electronUpdaterAdapter';
import { UpdateService } from '../../src/main/services/update/updateService';
import { AppError } from '../../src/main/utils/errors';
import type { Logger } from '../../src/main/utils/logger';

class MockUpdater extends EventEmitter implements ElectronUpdaterAdapter {
  autoDownload = true;
  allowDowngrade = true;
  autoInstallOnAppQuit = true;
  logger: unknown = null;
  setFeedURLCalls = 0;
  checkImpl: () => Promise<UpdateCheckResultLike | null> = async () => null;
  downloadImpl: () => Promise<string[]> = async () => [];
  quitAndInstallCalls = 0;
  lastQuitAndInstallArgs: [boolean?, boolean?] | null = null;

  async checkForUpdates(): Promise<UpdateCheckResultLike | null> {
    return this.checkImpl();
  }

  async downloadUpdate(): Promise<string[]> {
    return this.downloadImpl();
  }

  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void {
    this.quitAndInstallCalls += 1;
    this.lastQuitAndInstallArgs = [isSilent, isForceRunAfter];
  }

  emitProgress(progress: UpdateProgress): void {
    this.emit('download-progress', progress);
  }

  emitError(error: Error): void {
    this.emit('error', error);
  }
}

function createLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;
}

function createBackupService(
  result: { created: true; filePath: string } | { created: false; error: string },
): BackupService {
  return {
    createPreUpdateBackup: vi.fn(async () => result),
  } as unknown as BackupService;
}

describe('UpdateService', () => {
  it('reports unsupported outside packaged builds', async () => {
    const service = new UpdateService({
      currentVersion: '1.0.0',
      packaged: false,
      logger: createLogger(),
      backupService: createBackupService({ created: true, filePath: 'x.cab' }),
      updater: new MockUpdater(),
    });
    expect(service.getStatus().state).toBe('unsupported');
    const status = await service.checkForUpdates();
    expect(status.state).toBe('unsupported');
    expect(status.packaged).toBe(false);
  });

  it('does not override electron-builder app-update.yml with setFeedURL', () => {
    const updater = new MockUpdater();
    const original = updater.setFeedURLCalls;
    new UpdateService({
      currentVersion: '1.0.1',
      packaged: true,
      logger: createLogger(),
      backupService: createBackupService({ created: true, filePath: 'x.cab' }),
      updater,
    });
    expect(updater.setFeedURLCalls).toBe(original);
    expect(updater.autoDownload).toBe(false);
    expect(updater.allowDowngrade).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
  });

  it('exposes the public GitHub owner/repo on the status snapshot', () => {
    const service = new UpdateService({
      currentVersion: '1.0.1',
      packaged: true,
      logger: createLogger(),
      backupService: createBackupService({ created: true, filePath: 'x.cab' }),
      updater: new MockUpdater(),
    });
    expect(service.getStatus().provider).toEqual({
      owner: UPDATE_GITHUB_OWNER,
      repo: UPDATE_GITHUB_REPO,
    });
    expect(getUpdatePublishConfig().private).toBe(false);
  });

  it('transitions to upToDate when remote version is same or older', async () => {
    const updater = new MockUpdater();
    updater.checkImpl = async () => ({ updateInfo: { version: '1.0.0' } });
    const service = new UpdateService({
      currentVersion: '1.0.0',
      packaged: true,
      logger: createLogger(),
      backupService: createBackupService({ created: true, filePath: 'x.cab' }),
      updater,
    });

    expect((await service.checkForUpdates()).state).toBe('upToDate');

    updater.checkImpl = async () => ({ updateInfo: { version: '0.9.0' } });
    expect((await service.checkForUpdates()).state).toBe('upToDate');
  });

  it('treats electron-updater isUpdateAvailable=false as upToDate', async () => {
    const updater = new MockUpdater();
    updater.checkImpl = async () => ({
      isUpdateAvailable: false,
      updateInfo: { version: '1.0.1' },
    });
    const service = new UpdateService({
      currentVersion: '1.0.1',
      packaged: true,
      logger: createLogger(),
      backupService: createBackupService({ created: true, filePath: 'x.cab' }),
      updater,
    });
    const status = await service.checkForUpdates();
    expect(status.state).toBe('upToDate');
    expect(status.errorCode).toBeNull();
  });

  it('maps update-not-available events to upToDate, never error', async () => {
    const updater = new MockUpdater();
    updater.checkImpl = async () => {
      updater.emit('update-not-available', { version: '1.0.1' });
      return { isUpdateAvailable: false, updateInfo: { version: '1.0.1' } };
    };
    const service = new UpdateService({
      currentVersion: '1.0.1',
      packaged: true,
      logger: createLogger(),
      backupService: createBackupService({ created: true, filePath: 'x.cab' }),
      updater,
    });
    const status = await service.checkForUpdates();
    expect(status.state).toBe('upToDate');
    expect(status.errorCode).toBeNull();
  });

  it('transitions available → downloading → ready', async () => {
    const updater = new MockUpdater();
    updater.checkImpl = async () => ({ updateInfo: { version: '1.1.0', releaseNotes: 'notes' } });
    updater.downloadImpl = async () => {
      updater.emitProgress({ percent: 40, bytesPerSecond: 100, transferred: 40, total: 100 });
      return ['file'];
    };

    const service = new UpdateService({
      currentVersion: '1.0.0',
      packaged: true,
      logger: createLogger(),
      backupService: createBackupService({ created: true, filePath: 'x.cab' }),
      updater,
    });

    const available = await service.checkForUpdates();
    expect(available.state).toBe('available');
    expect(available.availableVersion).toBe('1.1.0');
    expect(available.releaseNotes).toBe('notes');

    const downloadingSeen: string[] = [];
    service.onStatus((snapshot) => downloadingSeen.push(snapshot.state));
    const ready = await service.downloadUpdate();
    expect(ready.state).toBe('ready');
    expect(downloadingSeen).toContain('downloading');
  });

  it('enters error state when GitHub feed check fails and keeps the app usable', async () => {
    const updater = new MockUpdater();
    updater.checkImpl = async () => {
      throw new Error(
        '404 \n"method: GET url: https://github.com/HashmatKhanSediqi/sameer-desktop-app/releases.atom\\n\\nPlease double check that your authentication token is correct."',
      );
    };
    const logger = createLogger();
    const service = new UpdateService({
      currentVersion: '1.0.0',
      packaged: true,
      logger,
      backupService: createBackupService({ created: true, filePath: 'x.cab' }),
      updater,
    });

    await expect(service.checkForUpdates()).rejects.toBeInstanceOf(AppError);
    expect(service.getStatus().state).toBe('error');
    expect(service.getStatus().errorCode).toBe('UPDATE_CHECK_FAILED');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('rejects invalid remote versions safely', async () => {
    const updater = new MockUpdater();
    updater.checkImpl = async () => ({ updateInfo: { version: 'latest' } });
    const service = new UpdateService({
      currentVersion: '1.0.0',
      packaged: true,
      logger: createLogger(),
      backupService: createBackupService({ created: true, filePath: 'x.cab' }),
      updater,
    });
    const status = await service.checkForUpdates();
    expect(status.state).toBe('error');
    expect(status.errorCode).toBe('UPDATE_INVALID_VERSION');
  });

  it('blocks install when pre-update backup fails', async () => {
    const updater = new MockUpdater();
    updater.checkImpl = async () => ({ updateInfo: { version: '1.2.0' } });
    const backupService = createBackupService({ created: false, error: 'disk full' });
    const service = new UpdateService({
      currentVersion: '1.0.0',
      packaged: true,
      logger: createLogger(),
      backupService,
      updater,
    });

    await service.checkForUpdates();
    await service.downloadUpdate();
    await expect(service.installUpdate()).rejects.toMatchObject({ code: 'UPDATE_BACKUP_FAILED' });
    expect(updater.quitAndInstallCalls).toBe(0);
    expect(service.isInstallPending()).toBe(false);
    expect(service.getStatus().state).toBe('error');
    expect(backupService.createPreUpdateBackup).toHaveBeenCalledTimes(1);
  });

  it('requires validated backup before quitAndInstall', async () => {
    const updater = new MockUpdater();
    updater.checkImpl = async () => ({ updateInfo: { version: '1.2.0' } });
    const backupService = createBackupService({
      created: true,
      filePath: 'C:\\tmp\\FMT_PreUpdate_test.cab',
    });
    const service = new UpdateService({
      currentVersion: '1.0.0',
      packaged: true,
      logger: createLogger(),
      backupService,
      updater,
    });

    await service.checkForUpdates();
    await service.downloadUpdate();
    const status = await service.installUpdate();
    expect(backupService.createPreUpdateBackup).toHaveBeenCalledTimes(1);
    expect(updater.quitAndInstallCalls).toBe(1);
    expect(updater.lastQuitAndInstallArgs).toEqual([true, true]);
    expect(service.isInstallPending()).toBe(true);
    expect(status.safetyBackupPath).toContain('FMT_PreUpdate_');
  });

  it('throttles automatic checks', async () => {
    const updater = new MockUpdater();
    let calls = 0;
    updater.checkImpl = async () => {
      calls += 1;
      return { updateInfo: { version: '1.0.0' } };
    };
    const service = new UpdateService({
      currentVersion: '1.0.0',
      packaged: true,
      logger: createLogger(),
      backupService: createBackupService({ created: true, filePath: 'x.cab' }),
      updater,
    });

    await service.maybeAutoCheck();
    await service.maybeAutoCheck();
    expect(calls).toBe(1);
    expect(UPDATE_AUTO_CHECK_INTERVAL_MS).toBeGreaterThan(0);
  });

  it('treats electron-updater no-update errors as upToDate, not offline failure', async () => {
    const updater = new MockUpdater();
    updater.checkImpl = async () => {
      throw new Error('No published updates available');
    };
    const service = new UpdateService({
      currentVersion: '1.0.0',
      packaged: true,
      logger: createLogger(),
      backupService: createBackupService({ created: true, filePath: 'x.cab' }),
      updater,
    });

    const status = await service.checkForUpdates();
    expect(status.state).toBe('upToDate');
    expect(status.errorCode).toBeNull();
  });

  it('does not let a later updater error event overwrite an upToDate result', async () => {
    const updater = new MockUpdater();
    updater.checkImpl = async () => ({ updateInfo: { version: '1.0.0' } });
    const service = new UpdateService({
      currentVersion: '1.0.0',
      packaged: true,
      logger: createLogger(),
      backupService: createBackupService({ created: true, filePath: 'x.cab' }),
      updater,
    });

    await service.checkForUpdates();
    updater.emitError(new Error('No published updates available'));
    expect(service.getStatus().state).toBe('upToDate');
    updater.emitError(new Error('ENOTFOUND'));
    expect(service.getStatus().state).toBe('upToDate');
  });

  it('surfaces download failures as error without installing', async () => {
    const updater = new MockUpdater();
    updater.checkImpl = async () => ({ updateInfo: { version: '1.2.0' } });
    updater.downloadImpl = async () => {
      throw new Error('net::ERR_CONNECTION_RESET');
    };
    const service = new UpdateService({
      currentVersion: '1.0.0',
      packaged: true,
      logger: createLogger(),
      backupService: createBackupService({ created: true, filePath: 'x.cab' }),
      updater,
    });
    await service.checkForUpdates();
    await expect(service.downloadUpdate()).rejects.toMatchObject({ code: 'UPDATE_DOWNLOAD_FAILED' });
    expect(service.getStatus().state).toBe('error');
    expect(updater.quitAndInstallCalls).toBe(0);
  });
});
