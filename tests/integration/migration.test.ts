import { describe, expect, it } from 'vitest';
import { applyProjectMigrations, createTestDatabase } from '../helpers/testDatabase';
import { getAppliedMigrationVersions } from '../../src/main/database/migrationRunner';

describe('migrations', () => {
  it('applies 001_initial migration and records schema version', () => {
    const testDb = createTestDatabase();

    try {
      applyProjectMigrations(testDb.db, testDb.logger);

      const applied = getAppliedMigrationVersions(testDb.db);
      expect(applied.has(1)).toBe(true);

      const adminTable = testDb.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'admin_users'")
        .get();
      expect(adminTable).toBeTruthy();
    } finally {
      testDb.cleanup();
    }
  });

  it('re-running migrations is safe', () => {
    const testDb = createTestDatabase();

    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const afterFirst = getAppliedMigrationVersions(testDb.db);

      applyProjectMigrations(testDb.db, testDb.logger);
      const afterSecond = getAppliedMigrationVersions(testDb.db);

      expect(afterFirst.has(1)).toBe(true);
      expect(afterSecond.size).toBe(afterFirst.size);

      expect(afterSecond.has(7)).toBe(true);
      expect(afterSecond.has(8)).toBe(true);
      expect(afterSecond.has(11)).toBe(true);
      const teller = testDb.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'teller_transactions'")
        .get();
      expect(teller).toBeTruthy();

      const displayName = testDb.db.prepare("PRAGMA table_info(currencies)").all() as Array<{ name: string }>;
      expect(displayName.some((column) => column.name === 'display_name')).toBe(true);

      const eurDenoms = testDb.db
        .prepare("SELECT COUNT(*) AS count FROM denominations WHERE currency_code = 'EUR'")
        .get() as { count: number };
      expect(eurDenoms.count).toBe(13);

      const tellerColumns = testDb.db.prepare('PRAGMA table_info(teller_transactions)').all() as Array<{ name: string }>;
      expect(tellerColumns.some((column) => column.name === 'worksheet_row')).toBe(true);
    } finally {
      testDb.cleanup();
    }
  });
});
