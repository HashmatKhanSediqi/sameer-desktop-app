import { describe, expect, it } from 'vitest';
import { applyProjectMigrations, createTestDatabase } from '../helpers/testDatabase';
import { getAppliedMigrationVersions } from '../../src/main/database/migrationRunner';
import {
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
  seedDefaultAdminIfEmpty,
} from '../../src/main/services/auth/adminSeedService';
import bcrypt from 'bcrypt';

describe('customer migration', () => {
  it('applies 002_customers and is idempotent', () => {
    const testDb = createTestDatabase();

    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      applyProjectMigrations(testDb.db, testDb.logger);

      const applied = getAppliedMigrationVersions(testDb.db);
      expect(applied.has(1)).toBe(true);
      expect(applied.has(2)).toBe(true);

      const versionCount = testDb.db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get() as {
        count: number;
      };
      expect(versionCount.count).toBe(applied.size);

      const customersTable = testDb.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'customers'")
        .get();
      expect(customersTable).toBeTruthy();
    } finally {
      testDb.cleanup();
    }
  });

  it('preserves existing admin data when customers migration is applied', async () => {
    const testDb = createTestDatabase();

    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      await seedDefaultAdminIfEmpty(testDb.db, testDb.logger);

      const before = testDb.db
        .prepare('SELECT username, password_hash FROM admin_users WHERE username = ?')
        .get(DEFAULT_ADMIN_USERNAME) as { username: string; password_hash: string };

      applyProjectMigrations(testDb.db, testDb.logger);

      const after = testDb.db
        .prepare('SELECT username, password_hash FROM admin_users WHERE username = ?')
        .get(DEFAULT_ADMIN_USERNAME) as { username: string; password_hash: string };

      expect(after.username).toBe(before.username);
      expect(after.password_hash).toBe(before.password_hash);
      expect(await bcrypt.compare(DEFAULT_ADMIN_PASSWORD, after.password_hash)).toBe(true);
    } finally {
      testDb.cleanup();
    }
  });

  it('creates required customer columns and search indexes without a unique customer number', () => {
    const testDb = createTestDatabase();

    try {
      applyProjectMigrations(testDb.db, testDb.logger);

      const columns = testDb.db.prepare('PRAGMA table_info(customers)').all() as Array<{
        name: string;
        notnull: number;
        pk: number;
      }>;
      const columnNames = columns.map((column) => column.name);

      expect(columnNames).toEqual(
        expect.arrayContaining(['id', 'name', 'customer_number', 'photo_filename', 'created_at', 'updated_at']),
      );
      expect(columns.find((column) => column.name === 'id')?.pk).toBe(1);
      expect(columns.find((column) => column.name === 'created_at')?.notnull).toBe(1);
      expect(columns.find((column) => column.name === 'updated_at')?.notnull).toBe(1);
      expect(columns.find((column) => column.name === 'name')?.notnull).toBe(0);
      expect(columns.find((column) => column.name === 'customer_number')?.notnull).toBe(0);

      const indexes = testDb.db.prepare('PRAGMA index_list(customers)').all() as Array<{
        name: string;
        unique: number;
      }>;
      expect(indexes.some((index) => index.name === 'idx_customers_number')).toBe(true);
      expect(indexes.some((index) => index.name === 'idx_customers_name')).toBe(true);
      expect(indexes.some((index) => index.unique === 1 && index.name === 'idx_customers_number')).toBe(false);

      expect(() => {
        testDb.db
          .prepare('INSERT INTO customers (name, customer_number) VALUES (?, ?)')
          .run('Ahmad', 'C-100');
        testDb.db
          .prepare('INSERT INTO customers (name, customer_number) VALUES (?, ?)')
          .run('Mahmood', 'C-100');
      }).not.toThrow();
    } finally {
      testDb.cleanup();
    }
  });
});
