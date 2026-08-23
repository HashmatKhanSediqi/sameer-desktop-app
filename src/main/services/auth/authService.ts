import bcrypt from 'bcrypt';
import type Database from 'better-sqlite3';
import {
  normalizeRecoveryAnswer,
  normalizeRecoveryQuestion,
  validateNewPassword,
  validatePasswordConfirmation,
} from '@shared/passwordPolicy';
import { AdminRepository } from '../../database/repositories/adminRepository';
import { AppError } from '../../utils/errors';
import type { Logger } from '../../utils/logger';
import { BCRYPT_COST } from './adminSeedService';
import { SessionStore, type Session } from './sessionStore';

export interface LoginSuccess {
  sessionId: string;
  username: string;
}

export interface SessionCheckResult {
  valid: boolean;
  username?: string;
}

export class AuthService {
  private readonly adminRepository: AdminRepository;

  constructor(
    db: Database.Database,
    private readonly sessionStore: SessionStore,
    private readonly logger: Logger,
  ) {
    this.adminRepository = new AdminRepository(db);
  }

  async login(username: string, password: string): Promise<LoginSuccess> {
    const normalizedUsername = username.trim();

    if (normalizedUsername.length === 0 || password.length === 0) {
      throw new AppError('INVALID_REQUEST', 'Username and password are required');
    }

    const admin = this.adminRepository.findByUsername(normalizedUsername);

    if (!admin) {
      this.logger.warn('Login failed', { username: normalizedUsername, reason: 'unknown_user' });
      throw new AppError('INVALID_CREDENTIALS', 'Invalid username or password');
    }

    const passwordMatches = await bcrypt.compare(password, admin.password_hash);
    if (!passwordMatches) {
      this.logger.warn('Login failed', { username: normalizedUsername, reason: 'invalid_password' });
      throw new AppError('INVALID_CREDENTIALS', 'Invalid username or password');
    }

    const session = this.sessionStore.create(admin.id, admin.username);
    this.logger.info('Login succeeded', { username: admin.username });

    return {
      sessionId: session.id,
      username: admin.username,
    };
  }

  logout(sessionId: string): void {
    if (!sessionId || sessionId.trim().length === 0) {
      throw new AppError('INVALID_REQUEST', 'Session ID is required');
    }

    this.sessionStore.delete(sessionId);
    this.logger.info('Logout succeeded');
  }

  checkSession(sessionId: string | undefined): SessionCheckResult {
    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
      return { valid: false };
    }

    const session = this.sessionStore.get(sessionId);
    if (!session) {
      return { valid: false };
    }

    return {
      valid: true,
      username: session.username,
    };
  }

  requireSession(sessionId: string | undefined): Session {
    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
      throw new AppError('NOT_AUTHENTICATED', 'Authentication required');
    }

    const session = this.sessionStore.get(sessionId);
    if (!session) {
      throw new AppError('SESSION_EXPIRED', 'Session expired or invalid');
    }

    return session;
  }

  invalidateAllSessions(): void {
    this.sessionStore.clear();
  }

  async changePassword(
    sessionId: string | undefined,
    currentPassword: unknown,
    newPassword: unknown,
    confirmPassword: unknown,
  ): Promise<{ success: true; sessionInvalidated: true }> {
    const session = this.requireSession(sessionId);
    if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'PASSWORD_REQUIRED');
    }

    const policyError = validateNewPassword(newPassword) ?? validatePasswordConfirmation(newPassword as string, confirmPassword);
    if (policyError) {
      throw new AppError('VALIDATION_ERROR', policyError);
    }

    const admin = this.adminRepository.findByUsername(session.username);
    if (!admin) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid username or password');
    }

    const currentMatches = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!currentMatches) {
      this.logger.warn('Password change failed', { reason: 'invalid_current' });
      throw new AppError('INVALID_CREDENTIALS', 'Invalid username or password');
    }

    if (currentPassword === newPassword) {
      throw new AppError('VALIDATION_ERROR', 'PASSWORD_UNCHANGED');
    }

    const nextHash = await bcrypt.hash(newPassword as string, BCRYPT_COST);
    this.adminRepository.updatePasswordHash(admin.id, nextHash);
    this.invalidateAllSessions();
    this.logger.info('Password changed');
    return { success: true, sessionInvalidated: true };
  }

  async setRecovery(
    sessionId: string | undefined,
    question: unknown,
    answer: unknown,
  ): Promise<{ configured: true; question: string }> {
    const session = this.requireSession(sessionId);
    const normalizedQuestion = normalizeRecoveryQuestion(question);
    const normalizedAnswer = normalizeRecoveryAnswer(answer);
    if (!normalizedQuestion || !normalizedAnswer) {
      throw new AppError('VALIDATION_ERROR', 'RECOVERY_INVALID');
    }

    const admin = this.adminRepository.findByUsername(session.username);
    if (!admin) {
      throw new AppError('NOT_AUTHENTICATED', 'Authentication required');
    }

    const answerHash = await bcrypt.hash(normalizedAnswer, BCRYPT_COST);
    this.adminRepository.updateRecovery(admin.id, normalizedQuestion, answerHash);
    this.logger.info('Recovery hint configured');
    return { configured: true, question: normalizedQuestion };
  }

  getRecoveryStatus(sessionId: string | undefined): { configured: boolean; question: string | null } {
    const session = this.requireSession(sessionId);
    const admin = this.adminRepository.findByUsername(session.username);
    if (!admin || !admin.recovery_question || !admin.recovery_answer_hash) {
      return { configured: false, question: null };
    }
    return { configured: true, question: admin.recovery_question };
  }

  recoveryPrompt(username: unknown): { question: string } {
    const normalizedUsername = typeof username === 'string' ? username.trim() : '';
    if (normalizedUsername.length === 0) {
      return { question: '' };
    }
    const admin = this.adminRepository.findByUsername(normalizedUsername);
    return { question: admin?.recovery_question ?? '' };
  }

  async recoverPassword(
    username: unknown,
    answer: unknown,
    newPassword: unknown,
    confirmPassword: unknown,
  ): Promise<{ success: true }> {
    const policyError = validateNewPassword(newPassword) ?? validatePasswordConfirmation(newPassword as string, confirmPassword);
    if (policyError) {
      throw new AppError('VALIDATION_ERROR', policyError);
    }

    const normalizedUsername = typeof username === 'string' ? username.trim() : '';
    const normalizedAnswer = normalizeRecoveryAnswer(answer);
    const admin = normalizedUsername.length > 0 ? this.adminRepository.findByUsername(normalizedUsername) : undefined;

    if (!admin || !admin.recovery_answer_hash || !normalizedAnswer) {
      this.logger.warn('Password recovery failed', { reason: 'invalid_recovery' });
      throw new AppError('RECOVERY_FAILED', 'RECOVERY_FAILED');
    }

    const answerMatches = await bcrypt.compare(normalizedAnswer, admin.recovery_answer_hash);
    if (!answerMatches) {
      this.logger.warn('Password recovery failed', { reason: 'invalid_recovery' });
      throw new AppError('RECOVERY_FAILED', 'RECOVERY_FAILED');
    }

    const nextHash = await bcrypt.hash(newPassword as string, BCRYPT_COST);
    this.adminRepository.updatePasswordHash(admin.id, nextHash);
    this.invalidateAllSessions();
    this.logger.info('Password recovered');
    return { success: true };
  }
}
