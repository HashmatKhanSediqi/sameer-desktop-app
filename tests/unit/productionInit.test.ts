import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
  seedDefaultAdminIfEmpty,
} from '../../src/main/services/auth/adminSeedService';
import { applyProjectMigrations, createTestDatabase } from '../helpers/testDatabase';

describe('production database initialization', () => {
  it('does not seed customers, transactions, or a configured company on a fresh database', async () => {
    const testDb = createTestDatabase();
    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      await seedDefaultAdminIfEmpty(testDb.db, testDb.logger);

      const customers = testDb.db.prepare('SELECT COUNT(*) AS count FROM customers').get() as { count: number };
      const transactions = testDb.db.prepare('SELECT COUNT(*) AS count FROM transactions').get() as { count: number };
      const company = testDb.db
        .prepare('SELECT name, configured FROM company_profile WHERE id = 1')
        .get() as { name: string | null; configured: number };
      const admins = testDb.db.prepare('SELECT username FROM admin_users').all() as Array<{ username: string }>;

      expect(customers.count).toBe(0);
      expect(transactions.count).toBe(0);
      expect(company.configured).toBe(0);
      expect(company.name).toBeNull();
      expect(admins).toEqual([{ username: DEFAULT_ADMIN_USERNAME }]);
      expect(DEFAULT_ADMIN_PASSWORD).toBe('admin123');
    } finally {
      testDb.cleanup();
    }
  });

  it('does not include demo customer or transaction inserts in project migrations', () => {
    const migrationsDir = join(process.cwd(), 'migrations');
    const files = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql'));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      expect(sql).not.toMatch(/INSERT\s+INTO\s+customers/i);
      expect(sql).not.toMatch(/INSERT\s+INTO\s+transactions/i);
      expect(sql).not.toMatch(/INSERT\s+INTO\s+company_profile\s*\([^)]*name/i);
    }
  });
});
