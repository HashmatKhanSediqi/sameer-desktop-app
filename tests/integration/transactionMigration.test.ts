import bcrypt from 'bcrypt';
import { describe, expect, it } from 'vitest';
import { applyProjectMigrations, createTestDatabase } from '../helpers/testDatabase';
import { getAppliedMigrationVersions } from '../../src/main/database/migrationRunner';
import {
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
  seedDefaultAdminIfEmpty,
} from '../../src/main/services/auth/adminSeedService';

describe('transaction migration', () => {
  it('applies 003_transactions and is idempotent', () => {
    const testDb = createTestDatabase();

    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      applyProjectMigrations(testDb.db, testDb.logger);

      const applied = getAppliedMigrationVersions(testDb.db);
      expect(applied.has(1)).toBe(true);
      expect(applied.has(2)).toBe(true);
      expect(applied.has(3)).toBe(true);

      const versionCount = testDb.db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get() as {
        count: number;
      };
      expect(versionCount.count).toBe(applied.size);

      const tables = testDb.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('transactions', 'currencies')",
        )
        .all() as Array<{ name: string }>;
      expect(tables.map((row) => row.name).sort()).toEqual(['currencies', 'transactions']);
    } finally {
      testDb.cleanup();
    }
  });

  it('preserves admin and customer data when transactions migration is applied', async () => {
    const testDb = createTestDatabase();

    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      await seedDefaultAdminIfEmpty(testDb.db, testDb.logger);
      testDb.db.prepare('INSERT INTO customers (name, customer_number) VALUES (?, ?)').run('Ahmad', 'C-1');

      applyProjectMigrations(testDb.db, testDb.logger);

      const admin = testDb.db
        .prepare('SELECT username, password_hash FROM admin_users WHERE username = ?')
        .get(DEFAULT_ADMIN_USERNAME) as { username: string; password_hash: string };
      expect(await bcrypt.compare(DEFAULT_ADMIN_PASSWORD, admin.password_hash)).toBe(true);

      const customers = testDb.db.prepare('SELECT COUNT(*) AS count FROM customers').get() as { count: number };
      expect(customers.count).toBe(1);
    } finally {
      testDb.cleanup();
    }
  });

  it('cascades transaction deletion when a customer is deleted', () => {
    const testDb = createTestDatabase();

    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const customerId = Number(
        testDb.db.prepare('INSERT INTO customers (name) VALUES (?)').run('Temp').lastInsertRowid,
      );
      testDb.db
        .prepare(
          `INSERT INTO transactions (customer_id, type, currency_code, amount)
           VALUES (?, 'CASH_IN', 'AFN', '100')`,
        )
        .run(customerId);

      expect(
        (testDb.db.prepare('SELECT COUNT(*) AS count FROM transactions').get() as { count: number }).count,
      ).toBe(1);

      testDb.db.prepare('DELETE FROM customers WHERE id = ?').run(customerId);
      expect(
        (testDb.db.prepare('SELECT COUNT(*) AS count FROM transactions').get() as { count: number }).count,
      ).toBe(0);
    } finally {
      testDb.cleanup();
    }
  });

  it('rejects invalid transaction types and missing customers at the database layer', () => {
    const testDb = createTestDatabase();

    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      expect(() => {
        testDb.db
          .prepare(
            `INSERT INTO transactions (customer_id, type, currency_code, amount)
             VALUES (1, 'TRANSFER', 'AFN', '10')`,
          )
          .run();
      }).toThrow();

      expect(() => {
        testDb.db
          .prepare(
            `INSERT INTO transactions (customer_id, type, currency_code, amount)
             VALUES (999, 'CASH_IN', 'AFN', '10')`,
          )
          .run();
      }).toThrow();
    } finally {
      testDb.cleanup();
    }
  });
});
