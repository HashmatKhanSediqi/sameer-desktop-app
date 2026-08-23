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
    } finally {
      testDb.cleanup();
    }
  });
});
