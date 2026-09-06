import { cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { AppPaths } from '@shared/types/ipc';
import { resolveAppPaths } from '../../config/paths';
import { AppError } from '../../utils/errors';
import type { BackupService } from './backupService';

export interface RecoveryContext { database: { close(): void } }
export const RECOVERY_PENDING_FILE = 'recovery-pending.json';

/** No live DB dependency: validate and initialize a private snapshot before moving live files. */
export class RecoveryService<T extends RecoveryContext> {
  private busy = false;
  constructor(private readonly deps: {
    paths: AppPaths;
    backups: Pick<BackupService, 'extractAndValidate'>;
    initialize(paths: AppPaths): Promise<T>;
  }) {}

  async restore(filePath: string): Promise<{ context: T; safetyPath: string | null }> {
    if (this.busy) throw new AppError('RESTORE_FAILED', 'Recovery is already running');
    this.busy = true;
    let extracted: ReturnType<BackupService['extractAndValidate']> | undefined;
    let stagingRoot: string | undefined;
    try {
      extracted = this.deps.backups.extractAndValidate(filePath);
      mkdirSync(this.deps.paths.backups, { recursive: true });
      stagingRoot = mkdtempSync(join(this.deps.paths.backups, 'recovery-staging-'));
      const staged = resolveAppPaths(stagingRoot);
      mkdirSync(dirname(staged.database), { recursive: true });
      cpSync(extracted.databasePath, staged.database, { errorOnExist: true, force: false });
      for (const [source, target] of [
        [join(extracted.stagingDir, 'images', 'customers'), staged.images],
        [join(extracted.stagingDir, 'images', 'company'), staged.companyImages],
      ] as const) {
        if (existsSync(source)) cpSync(source, target, { recursive: true, errorOnExist: true, force: false });
      }
      // Includes integrity, migrations, admin/schema checks and every normal service binding.
      const preview = await this.deps.initialize(staged);
      preview.database.close();

      const liveData = dirname(this.deps.paths.database);
      const safetyRoot = mkdtempSync(join(this.deps.paths.backups, `pre-recovery-${new Date().toISOString().replace(/[:.]/g, '-')}-`));
      const safetyPath = join(safetyRoot, basename(liveData));
      const hadData = existsSync(liveData);
      const marker = join(this.deps.paths.userData, RECOVERY_PENDING_FILE);
      // A crash between directory moves must enter recovery, never seed a new empty account.
      writeFileSync(marker, JSON.stringify({ safetyPath, stagingRoot }), { flush: true });
      try {
        // Rename the complete directory, including WAL/SHM and images, on the same volume.
        // If preservation fails, stop; there is no unsafe "continue anyway" path.
        if (hadData) renameSync(liveData, safetyPath);
      } catch {
        throw new AppError('RESTORE_FAILED', 'Cannot preserve the failed database. No replacement was performed. Close FMT processes or check folder permissions, then retry.');
      }
      try {
        renameSync(dirname(staged.database), liveData);
        const context = await this.deps.initialize(this.deps.paths);
        try { rmSync(marker); } catch (error) { context.database.close(); throw error; }
        return { context, safetyPath: hadData ? safetyPath : null };
      } catch (error) {
        // Keep both the original safety copy and the rejected restored state for diagnosis.
        if (existsSync(liveData)) renameSync(liveData, join(safetyRoot, 'rejected-restored-data'));
        if (hadData) cpSync(safetyPath, liveData, { recursive: true, errorOnExist: true, force: false });
        rmSync(marker, { force: true });
        throw error;
      }
    } finally {
      this.busy = false;
      if (extracted) rmSync(extracted.stagingDir, { recursive: true, force: true });
      if (stagingRoot) rmSync(stagingRoot, { recursive: true, force: true });
    }
  }
}
