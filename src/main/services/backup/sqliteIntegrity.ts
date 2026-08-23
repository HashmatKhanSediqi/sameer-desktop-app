import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { AppError } from '../../utils/errors';

export const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'utf8');

export function hasSqliteMagic(buffer: Buffer): boolean {
  if (buffer.length < SQLITE_MAGIC.length) {
    return false;
  }
  return buffer.subarray(0, SQLITE_MAGIC.length).equals(SQLITE_MAGIC);
}

export function assertSqliteDatabaseFile(filePath: string): void {
  const header = readFileSync(filePath).subarray(0, SQLITE_MAGIC.length);
  if (!hasSqliteMagic(header)) {
    throw new AppError('INVALID_BACKUP', 'invalidFile');
  }
}

export function verifySqliteIntegrity(filePath: string): boolean {
  let db: Database.Database | undefined;
  try {
    assertSqliteDatabaseFile(filePath);
    db = new Database(filePath, { readonly: true, fileMustExist: true });
    const result = db.pragma('integrity_check', { simple: true });
    return result === 'ok';
  } catch {
    return false;
  } finally {
    db?.close();
  }
}
