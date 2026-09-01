import { describe, expect, it, vi } from 'vitest';
import { QuitBackupCoordinator } from '../../src/main/services/backup/quitBackupCoordinator';
import type { Logger } from '../../src/main/utils/logger';

function createLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;
}

describe('QuitBackupCoordinator', () => {
  it('runs exactly one backup attempt and then allows quit', async () => {
    const coordinator = new QuitBackupCoordinator(1_000, createLogger());
    expect(coordinator.tryBegin()).toBe(true);
    expect(coordinator.tryBegin()).toBe(false);
    expect(coordinator.shouldBlockQuit()).toBe(true);

    const createBackup = vi.fn(async () => ({ created: true }));
    await coordinator.runBackupAttempt(createBackup);
    expect(createBackup).toHaveBeenCalledTimes(1);

    coordinator.markFinished();
    expect(coordinator.shouldBlockQuit()).toBe(false);
    expect(coordinator.isFinished()).toBe(true);
    expect(coordinator.tryBegin()).toBe(false);
  });

  it('treats backup failure as a completed attempt and does not loop', async () => {
    const logger = createLogger();
    const coordinator = new QuitBackupCoordinator(1_000, logger);
    expect(coordinator.tryBegin()).toBe(true);

    await coordinator.runBackupAttempt(async () => {
      throw new Error('disk full');
    });

    expect(logger.warn).toHaveBeenCalled();
    coordinator.markFinished();
    expect(coordinator.isFinished()).toBe(true);
    expect(coordinator.shouldBlockQuit()).toBe(false);
  });

  it('times out a hung backup without blocking forever', async () => {
    const logger = createLogger();
    const coordinator = new QuitBackupCoordinator(20, logger);
    expect(coordinator.tryBegin()).toBe(true);

    const started = Date.now();
    await coordinator.runBackupAttempt(
      () =>
        new Promise(() => {
          // never resolves
        }),
    );
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(logger.warn).toHaveBeenCalled();
    coordinator.markFinished();
    expect(coordinator.isFinished()).toBe(true);
  });
});
