import { describe, expect, it } from 'vitest';
import { AuthService } from '../../src/main/services/auth/authService';
import {
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
  seedDefaultAdminIfEmpty,
} from '../../src/main/services/auth/adminSeedService';
import { SessionStore } from '../../src/main/services/auth/sessionStore';
import { applyProjectMigrations, createTestDatabase } from '../helpers/testDatabase';

describe('AuthService', () => {
  it('accepts correct admin credentials', async () => {
    const testDb = createTestDatabase();

    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      await seedDefaultAdminIfEmpty(testDb.db, testDb.logger);

      const authService = new AuthService(
        testDb.db,
        new SessionStore(8 * 60 * 60 * 1000),
        testDb.logger,
      );

      const result = await authService.login(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);
      expect(result.username).toBe(DEFAULT_ADMIN_USERNAME);
      expect(result.sessionId.length).toBeGreaterThan(0);
    } finally {
      testDb.cleanup();
    }
  });

  it('rejects incorrect password', async () => {
    const testDb = createTestDatabase();

    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      await seedDefaultAdminIfEmpty(testDb.db, testDb.logger);

      const authService = new AuthService(
        testDb.db,
        new SessionStore(8 * 60 * 60 * 1000),
        testDb.logger,
      );

      await expect(authService.login(DEFAULT_ADMIN_USERNAME, 'wrong-password')).rejects.toMatchObject({
        code: 'INVALID_CREDENTIALS',
      });
    } finally {
      testDb.cleanup();
    }
  });

  it('rejects unknown username', async () => {
    const testDb = createTestDatabase();

    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      await seedDefaultAdminIfEmpty(testDb.db, testDb.logger);

      const authService = new AuthService(
        testDb.db,
        new SessionStore(8 * 60 * 60 * 1000),
        testDb.logger,
      );

      await expect(authService.login('unknown', DEFAULT_ADMIN_PASSWORD)).rejects.toMatchObject({
        code: 'INVALID_CREDENTIALS',
      });
    } finally {
      testDb.cleanup();
    }
  });

  it('logout clears authentication state', async () => {
    const testDb = createTestDatabase();

    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      await seedDefaultAdminIfEmpty(testDb.db, testDb.logger);

      const sessionStore = new SessionStore(8 * 60 * 60 * 1000);
      const authService = new AuthService(testDb.db, sessionStore, testDb.logger);

      const login = await authService.login(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);
      expect(authService.checkSession(login.sessionId).valid).toBe(true);

      authService.logout(login.sessionId);
      expect(authService.checkSession(login.sessionId).valid).toBe(false);
    } finally {
      testDb.cleanup();
    }
  });

  it('requireSession rejects missing session id', () => {
    const testDb = createTestDatabase();

    try {
      const authService = new AuthService(
        testDb.db,
        new SessionStore(8 * 60 * 60 * 1000),
        testDb.logger,
      );

      expect(() => authService.requireSession(undefined)).toThrowError(/Authentication required/);
    } finally {
      testDb.cleanup();
    }
  });
});
