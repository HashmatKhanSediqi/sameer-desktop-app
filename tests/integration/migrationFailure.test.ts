import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

      mkdirSync(tempMigrations, { recursive: true });
      for (const fileName of ['001_initial.sql', '002_customers.sql', '003_transactions.sql', '004_admin_company_theme_transfers.sql', '005_query_indexes.sql']) {
        copyFileSync(join(process.cwd(), 'migrations', fileName), join(tempMigrations, fileName));
      }
      writeFileSync(join(tempMigrations, '006_intentional_failure.sql'), 'THIS IS NOT VALID SQL;\n');

      expect(() => runMigrations(testDb.db, tempMigrations, testDb.logger)).toThrow();
      const appliedAfter = getAppliedMigrationVersions(testDb.db);
      expect(appliedAfter.has(6)).toBe(false);
      expect(appliedAfter.size).toBe(appliedBefore.size);
    } finally {
      testDb.cleanup();
      rmSync(tempMigrations, { recursive: true, force: true });
    }
  });
});
