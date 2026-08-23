import { AppError } from '../../utils/errors';

export const MAX_CUSTOMER_NAME_LENGTH = 200;
export const MAX_CUSTOMER_NUMBER_LENGTH = 50;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

// Letters, numbers, spaces, and common punctuation — Unicode-aware for Dari/Pashto digits/letters.
const CUSTOMER_NUMBER_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}\s\-._/#*+:()]*$/u;

export function stripControlCharacters(value: string): string {
  return value.replace(CONTROL_CHARS, '');
}

export function parsePositiveIntegerId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new AppError('VALIDATION_ERROR', 'INVALID_CUSTOMER_ID');
  }
  return value;
}

export function normalizeOptionalName(value: unknown): string | null {
  return normalizeOptionalText(value, MAX_CUSTOMER_NAME_LENGTH, 'NAME_TOO_LONG');
}

export function normalizeOptionalCustomerNumber(value: unknown): string | null {
  const normalized = normalizeOptionalText(
    value,
    MAX_CUSTOMER_NUMBER_LENGTH,
    'CUSTOMER_NUMBER_TOO_LONG',
  );

  if (normalized === null) {
    return null;
  }

  if (!CUSTOMER_NUMBER_PATTERN.test(normalized)) {
    throw new AppError('VALIDATION_ERROR', 'INVALID_CUSTOMER_NUMBER');
  }

  return normalized;
}

export function escapeLikePattern(value: string): string {
  return value.replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_');
}

function normalizeOptionalText(
  value: unknown,
  maxLength: number,
  tooLongCode: string,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'INVALID_REQUEST');
  }

  if (value.includes('\u0000')) {
    throw new AppError('VALIDATION_ERROR', 'INVALID_CHARACTERS');
  }

  const normalized = stripControlCharacters(value).trim();
  if (normalized.length === 0) {
    return null;
  }

  if (normalized.length > maxLength) {
    throw new AppError('VALIDATION_ERROR', tooLongCode);
  }

  return normalized;
}
