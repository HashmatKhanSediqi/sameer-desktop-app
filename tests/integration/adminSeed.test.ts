import bcrypt from 'bcrypt';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
  seedDefaultAdminIfEmpty,
} from '../../src/main/services/auth/adminSeedService';
import { applyProjectMigrations, createTestDatabase } from '../helpers/testDatabase';

describe('admin seed', () => {
  it('creates default admin when admin_users is empty', async () => {
    const testDb = createTestDatabase();

    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      await seedDefaultAdminIfEmpty(testDb.db, testDb.logger);

      const admin = testDb.db
        .prepare('SELECT username, password_hash FROM admin_users WHERE username = ?')
        .get(DEFAULT_ADMIN_USERNAME) as { username: string; password_hash: string } | undefined;

      expect(admin).toBeTruthy();
      expect(admin?.username).toBe(DEFAULT_ADMIN_USERNAME);
      expect(admin?.password_hash).not.toBe(DEFAULT_ADMIN_PASSWORD);
      expect(admin?.password_hash.startsWith('$2')).toBe(true);

      const matches = await bcrypt.compare(DEFAULT_ADMIN_PASSWORD, admin!.password_hash);
      expect(matches).toBe(true);
    } finally {
      testDb.cleanup();
    }
  });

  it('does not recreate admin when one already exists', async () => {
    const testDb = createTestDatabase();

    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      await seedDefaultAdminIfEmpty(testDb.db, testDb.logger);
      await seedDefaultAdminIfEmpty(testDb.db, testDb.logger);

      const row = testDb.db.prepare('SELECT COUNT(*) AS count FROM admin_users').get() as {
        count: number;
      };
      expect(row.count).toBe(1);
    } finally {
      testDb.cleanup();
    }
  });
});
