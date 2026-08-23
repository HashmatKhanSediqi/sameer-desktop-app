export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const MIN_RECOVERY_ANSWER_LENGTH = 3;
export const MAX_RECOVERY_QUESTION_LENGTH = 200;
export const MAX_RECOVERY_ANSWER_LENGTH = 200;

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export type PasswordPolicyCode =
  | 'PASSWORD_REQUIRED'
  | 'PASSWORD_TOO_SHORT'
  | 'PASSWORD_TOO_LONG'
  | 'PASSWORD_INVALID_CHARACTERS'
  | 'PASSWORD_MISMATCH'
  | 'PASSWORD_UNCHANGED';

export function validateNewPassword(password: unknown): PasswordPolicyCode | null {
  if (typeof password !== 'string' || password.length === 0) {
    return 'PASSWORD_REQUIRED';
  }
  if (CONTROL_CHARS.test(password)) {
    return 'PASSWORD_INVALID_CHARACTERS';
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return 'PASSWORD_TOO_SHORT';
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return 'PASSWORD_TOO_LONG';
  }
  return null;
}

export function validatePasswordConfirmation(
  password: string,
  confirmation: unknown,
): PasswordPolicyCode | null {
  if (typeof confirmation !== 'string' || confirmation !== password) {
    return 'PASSWORD_MISMATCH';
  }
  return null;
}

export function normalizeRecoveryAnswer(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.replace(CONTROL_CHARS, '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (normalized.length < MIN_RECOVERY_ANSWER_LENGTH || normalized.length > MAX_RECOVERY_ANSWER_LENGTH) {
    return null;
  }
  return normalized;
}

export function normalizeRecoveryQuestion(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  if (CONTROL_CHARS.test(value) || value.includes('\u0000')) {
    return null;
  }
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0 || normalized.length > MAX_RECOVERY_QUESTION_LENGTH) {
    return null;
  }
  return normalized;
}
