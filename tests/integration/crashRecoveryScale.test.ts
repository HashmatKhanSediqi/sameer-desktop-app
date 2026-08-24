import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  clearCrashSentinel,
  hadUncleanShutdown,
  setCrashSentinel,
} from '../../src/main/utils/crashSentinel';
import { DatabaseConnection } from '../../src/main/database/connection';
import { applyProjectMigrations, createTestDatabase } from '../helpers/testDatabase';
import { seedScaleDataset } from '../helpers/scaleDataset';

describe('crash recovery at moderate scale', () => {
  it('reopens after unclean sentinel with integrity ok and transfer pairs intact', () => {
    const testDb = createTestDatabase();
    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      seedScaleDataset(testDb.db, {
        profile: { customerCount: 5_000, transactionCount: 20_000 },
      });

      const userData = join(testDb.dbPath, '..');
      setCrashSentinel(userData);
      expect(hadUncleanShutdown(userData)).toBe(true);

      const beforePairs = testDb.db
        .prepare(
          `SELECT COUNT(*) AS count FROM transactions WHERE note IN ('transfer-out', 'transfer-in')`,
        )
        .get() as { count: number };

      testDb.db.close();

      const connection = new DatabaseConnection(testDb.dbPath, testDb.logger);
      const reopened = connection.connect();
      expect(reopened.pragma('integrity_check', { simple: true })).toBe('ok');
      expect(hadUncleanShutdown(userData)).toBe(true);

      const afterPairs = reopened
        .prepare(
          `SELECT COUNT(*) AS count FROM transactions WHERE note IN ('transfer-out', 'transfer-in')`,
        )
        .get() as { count: number };
      expect(afterPairs.count).toBe(beforePairs.count);
      expect(afterPairs.count % 2).toBe(0);

      clearCrashSentinel(userData);
      expect(hadUncleanShutdown(userData)).toBe(false);
      expect(existsSync(join(userData, '.crash'))).toBe(false);
      connection.close();
    } finally {
      testDb.cleanup();
    }
  });
});
