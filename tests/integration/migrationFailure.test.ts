import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getAppliedMigrationVersions, runMigrations } from '../../src/main/database/migrationRunner';
import { applyProjectMigrations, createTestDatabase } from '../helpers/testDatabase';

describe('migration failure safety', () => {
  it('does not record a migration version when SQL fails', () => {
    const testDb = createTestDatabase();
    const tempMigrations = mkdtempSync(join(tmpdir(), 'ca-migrations-'));
    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const appliedBefore = getAppliedMigrationVersions(testDb.db);
      const nextVersion = Math.max(...Array.from(appliedBefore), 0) + 1;

      mkdirSync(tempMigrations, { recursive: true });
      const projectMigrations = join(process.cwd(), 'migrations');
      for (const fileName of readdirSync(projectMigrations).filter((name) => name.endsWith('.sql'))) {
        copyFileSync(join(projectMigrations, fileName), join(tempMigrations, fileName));
      }
      writeFileSync(
        join(tempMigrations, `${String(nextVersion).padStart(3, '0')}_intentional_failure.sql`),
        'THIS IS NOT VALID SQL;\n',
      );

      expect(() => runMigrations(testDb.db, tempMigrations, testDb.logger)).toThrow();
      const appliedAfter = getAppliedMigrationVersions(testDb.db);
      expect(appliedAfter.has(nextVersion)).toBe(false);
      expect(appliedAfter.size).toBe(appliedBefore.size);
    } finally {
      testDb.cleanup();
      rmSync(tempMigrations, { recursive: true, force: true });
    }
  });
});
