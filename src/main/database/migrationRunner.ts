import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import type { Logger } from '../utils/logger';
import { AppError } from '../utils/errors';

export interface MigrationRecord {
  version: number;
  name: string;
  filename: string;
}

const MIGRATION_FILENAME_PATTERN = /^(\d+)_(.+)\.sql$/;

export function resolveMigrationsDirectory(candidates: string[]): string {
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new AppError(
    'DATABASE_ERROR',
    `Migrations directory not found. Checked: ${candidates.join(', ')}`,
  );
}

export function discoverMigrations(migrationsDir: string): MigrationRecord[] {
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  return files.map((filename) => {
    const match = MIGRATION_FILENAME_PATTERN.exec(filename);
    if (!match?.[1] || !match[2]) {
      throw new AppError('DATABASE_ERROR', `Invalid migration filename: ${filename}`);
    }

    return {
      version: Number.parseInt(match[1], 10),
      name: match[2],
      filename,
    };
  });
}

export function getAppliedMigrationVersions(db: Database.Database): Set<number> {
  const tableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
    )
    .get();

  if (!tableExists) {
    return new Set();
  }

  const rows = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Array<{
    version: number;
  }>;

  return new Set(rows.map((row) => row.version));
}

export function getAppliedSchemaVersion(db: Database.Database): number {
  const versions = getAppliedMigrationVersions(db);
  if (versions.size === 0) {
    return 0;
  }
  return Math.max(...versions);
}

export function getAvailableSchemaVersion(migrationsDir: string): number {
  const migrations = discoverMigrations(migrationsDir);
  if (migrations.length === 0) {
    return 0;
  }
  return Math.max(...migrations.map((migration) => migration.version));
}

export function runMigrations(
  db: Database.Database,
  migrationsDir: string,
  logger: Logger,
): void {
  const migrations = discoverMigrations(migrationsDir);
  const applied = getAppliedMigrationVersions(db);

  for (const migration of migrations) {
    if (applied.has(migration.version)) {
      continue;
    }

    const sqlPath = join(migrationsDir, migration.filename);
    const sql = readFileSync(sqlPath, 'utf8');

    logger.info('Applying migration', {
      version: migration.version,
      name: migration.name,
    });

    const applyMigration = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(
        migration.version,
        migration.name,
      );
    });

    try {
      applyMigration();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Migration failed', {
        version: migration.version,
        name: migration.name,
        error: message,
      });
      throw new AppError('DATABASE_ERROR', `Migration ${migration.version} failed: ${message}`);
    }
  }
}
