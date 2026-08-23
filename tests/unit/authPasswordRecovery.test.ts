import { describe, expect, it } from 'vitest';
import { AuthService } from '../../src/main/services/auth/authService';
import {
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
  seedDefaultAdminIfEmpty,
} from '../../src/main/services/auth/adminSeedService';
import { SessionStore } from '../../src/main/services/auth/sessionStore';
import { applyProjectMigrations, createTestDatabase } from '../helpers/testDatabase';

async function createAuth() {
  const testDb = createTestDatabase();
  applyProjectMigrations(testDb.db, testDb.logger);
  await seedDefaultAdminIfEmpty(testDb.db, testDb.logger);
  const sessionStore = new SessionStore(8 * 60 * 60 * 1000);
  const authService = new AuthService(testDb.db, sessionStore, testDb.logger);
  return { testDb, authService };
}

describe('AuthService password change and recovery', () => {
  it('changes the password when the current password is correct and invalidates sessions', async () => {
    const { testDb, authService } = await createAuth();
    try {
      const login = await authService.login(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);
      const result = await authService.changePassword(
        login.sessionId,
        DEFAULT_ADMIN_PASSWORD,
        'newpass12',
        'newpass12',
      );
      expect(result.sessionInvalidated).toBe(true);
      expect(authService.checkSession(login.sessionId).valid).toBe(false);

      await expect(authService.login(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD)).rejects.toMatchObject({
        code: 'INVALID_CREDENTIALS',
      });
      const next = await authService.login(DEFAULT_ADMIN_USERNAME, 'newpass12');
      expect(next.username).toBe(DEFAULT_ADMIN_USERNAME);
    } finally {
      testDb.cleanup();
    }
  });

  it('rejects an incorrect current password, mismatch, policy violations, and unchanged password', async () => {
    const { testDb, authService } = await createAuth();
    try {
      const login = await authService.login(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);

      await expect(
        authService.changePassword(login.sessionId, 'wrong-pass', 'newpass12', 'newpass12'),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

      await expect(
        authService.changePassword(login.sessionId, DEFAULT_ADMIN_PASSWORD, 'newpass12', 'otherpass'),
      ).rejects.toMatchObject({ message: 'PASSWORD_MISMATCH' });

      await expect(
        authService.changePassword(login.sessionId, DEFAULT_ADMIN_PASSWORD, 'short', 'short'),
      ).rejects.toMatchObject({ message: 'PASSWORD_TOO_SHORT' });

      await expect(
        authService.changePassword(login.sessionId, DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_PASSWORD),
      ).rejects.toMatchObject({ message: 'PASSWORD_UNCHANGED' });

      await authService.login(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);
    } finally {
      testDb.cleanup();
    }
  });

  it('stores a hashed recovery answer and recovers the password without leaking username vs answer', async () => {
    const { testDb, authService } = await createAuth();
    try {
      const login = await authService.login(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);
      expect(authService.getRecoveryStatus(login.sessionId).configured).toBe(false);

      const saved = await authService.setRecovery(
        login.sessionId,
        'What was the name of your first school?',
        'Example School',
      );
      expect(saved.question).toBe('What was the name of your first school?');

      const stored = testDb.db
        .prepare('SELECT recovery_question, recovery_answer_hash FROM admin_users WHERE username = ?')
        .get(DEFAULT_ADMIN_USERNAME) as { recovery_question: string; recovery_answer_hash: string };
      expect(stored.recovery_question).toBe('What was the name of your first school?');
      expect(stored.recovery_answer_hash).not.toContain('example school');
      expect(stored.recovery_answer_hash.startsWith('$2')).toBe(true);

      const knownPrompt = authService.recoveryPrompt(DEFAULT_ADMIN_USERNAME);
      const unknownPrompt = authService.recoveryPrompt('not-a-user');
      expect(knownPrompt).toEqual({ question: 'What was the name of your first school?' });
      expect(unknownPrompt).toEqual({ question: '' });

      await expect(
        authService.recoverPassword(DEFAULT_ADMIN_USERNAME, 'wrong answer', 'recovered1', 'recovered1'),
      ).rejects.toMatchObject({ code: 'RECOVERY_FAILED' });
      await expect(
        authService.recoverPassword('missing', 'Example School', 'recovered1', 'recovered1'),
      ).rejects.toMatchObject({ code: 'RECOVERY_FAILED' });

      await authService.recoverPassword(DEFAULT_ADMIN_USERNAME, 'Example School', 'recovered1', 'recovered1');
      expect(authService.checkSession(login.sessionId).valid).toBe(false);
      await expect(authService.login(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD)).rejects.toMatchObject({
        code: 'INVALID_CREDENTIALS',
      });
      await authService.login(DEFAULT_ADMIN_USERNAME, 'recovered1');
    } finally {
      testDb.cleanup();
    }
  });
});
