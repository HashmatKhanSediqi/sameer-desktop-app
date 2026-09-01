import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defaultAutoCloseBackupFileName } from '@shared/types/backup';
import { AppError } from '../../utils/errors';

const MAX_UNIQUE_NAME_ATTEMPTS = 1000;

export function resolveUniqueAutoBackupPath(directory: string, date = new Date()): string {
  for (let attempt = 0; attempt <= MAX_UNIQUE_NAME_ATTEMPTS; attempt += 1) {
    const candidateDate = new Date(date.getTime() + attempt * 1000);
    const destination = join(directory, defaultAutoCloseBackupFileName(candidateDate));
    if (!existsSync(destination)) {
      return destination;
    }
  }
  throw new AppError('BACKUP_WRITE_FAILED', 'writeFailed');
}
