import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrations } from '../../src/main/database/migrationRunner';
import { Logger } from '../../src/main/utils/logger';
import { loadAppConfig } from '../../src/main/config/appConfig';

export interface TestDatabase {
  dbPath: string;
  db: Database.Database;
  logger: Logger;
  cleanup: () => void;
}

export function createTestDatabase(): TestDatabase {
  const tempRoot = mkdtempSync(join(tmpdir(), 'ca-test-db-'));
  const dbPath = join(tempRoot, 'accounting.db');
  const config = loadAppConfig();
  const logger = new Logger(join(tempRoot, 'logs'), config);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const testDb: TestDatabase = {
    dbPath,
    db,
    logger,
    cleanup: () => {
      try {
        if (testDb.db.open) {
          testDb.db.close();
        }
      } catch {
        // already closed
      }
      rmSync(tempRoot, { recursive: true, force: true });
    },
  };

  return testDb;
}

export function applyProjectMigrations(db: Database.Database, logger: Logger): void {
  const migrationsDir = join(process.cwd(), 'migrations');
  if (!existsSync(migrationsDir)) {
    throw new Error(`Expected migrations directory at ${migrationsDir}`);
  }
  runMigrations(db, migrationsDir, logger);
}
