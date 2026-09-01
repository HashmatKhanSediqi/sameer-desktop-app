import type { Logger } from '../../utils/logger';

export type QuitBackupPhase = 'idle' | 'running' | 'finished';

/**
 * Single-flight shutdown helper for automatic close backup.
 * While a backup is running, later quit events must not start another backup
 * and must not allow the process to exit until the backup attempt finishes.
 */
export class QuitBackupCoordinator {
  private phase: QuitBackupPhase = 'idle';

  constructor(
    private readonly timeoutMs: number,
    private readonly logger: Logger,
  ) {}

  getPhase(): QuitBackupPhase {
    return this.phase;
  }

  isRunning(): boolean {
    return this.phase === 'running';
  }

  isFinished(): boolean {
    return this.phase === 'finished';
  }

  /** True while quit must wait for the in-flight backup (or skip) to finish. */
  shouldBlockQuit(): boolean {
    return this.phase === 'running';
  }

  tryBegin(): boolean {
    if (this.phase !== 'idle') {
      return false;
    }
    this.phase = 'running';
    return true;
  }

  markFinished(): void {
    this.phase = 'finished';
  }

  async runBackupAttempt(createBackup: () => Promise<unknown>): Promise<void> {
    try {
      await Promise.race([
        createBackup(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Auto-close backup timed out')), this.timeoutMs);
        }),
      ]);
    } catch (error) {
      this.logger.warn('Auto-close backup skipped or failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
