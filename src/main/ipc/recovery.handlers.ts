import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { RECOVERY_CHANNELS } from '@shared/types/recovery';
import type { BackupService } from '../services/backup/backupService';
import type { RecoveryContext, RecoveryService } from '../services/backup/recoveryService';
import { AppError, wrapIpcHandler } from '../utils/errors';

/** The only IPC handlers registered after failed startup. A renderer cannot supply a restore path. */
export function registerRecoveryHandlers<T extends RecoveryContext>(ipc: IpcMain, deps: {
  reason: string;
  allowed(event: IpcMainInvokeEvent): boolean;
  chooseFile(): Promise<string | undefined>;
  backups: Pick<BackupService, 'validate'>;
  recovery: Pick<RecoveryService<T>, 'restore'>;
  login(context: T): Promise<void>;
}): { dispose(): void; close(): void; isBusy(): boolean } {
  let selected: string | undefined;
  let restored: T | undefined;
  let busy = false;
  function register(channel: string, action: () => Promise<unknown> | unknown): void {
    ipc.handle(channel, (event) => wrapIpcHandler(async () => {
      if (!deps.allowed(event)) throw new AppError('NOT_AUTHENTICATED', 'Recovery window required');
      if (busy) throw new AppError('RESTORE_FAILED', 'Recovery is already running');
      busy = true;
      try { return await action(); } finally { busy = false; }
    }));
  }
  register(RECOVERY_CHANNELS.status, () => ({ reason: deps.reason }));
  register(RECOVERY_CHANNELS.select, async () => {
    if (restored) throw new AppError('INVALID_REQUEST', 'Recovery already completed');
    selected = undefined;
    const file = await deps.chooseFile();
    if (!file) return null;
    const result = await deps.backups.validate(file);
    if (!result.valid || !result.manifest) throw new AppError('INVALID_BACKUP', result.errors.join(', '));
    selected = file;
    return { fileName: result.fileName, createdAt: result.manifest.createdAt,
      customerCount: result.manifest.customerCount, transactionCount: result.manifest.transactionCount };
  });
  register(RECOVERY_CHANNELS.restore, async () => {
    if (!selected || restored) throw new AppError('INVALID_REQUEST', 'Select and validate a backup first');
    const result = await deps.recovery.restore(selected); // Revalidates the bytes at execution time.
    restored = result.context;
    return { safetyPath: result.safetyPath };
  });
  register(RECOVERY_CHANNELS.login, async () => {
    if (!restored) throw new AppError('INVALID_REQUEST', 'Recovery has not completed');
    await deps.login(restored);
    restored = undefined;
    return null;
  });
  return {
    dispose: () => { for (const channel of Object.values(RECOVERY_CHANNELS)) ipc.removeHandler(channel); },
    close: () => { restored?.database.close(); restored = undefined; },
    isBusy: () => busy,
  };
}
