import { formatTellerAmount } from '@shared/teller/denominationMath';
import type { TellerDirection } from '@shared/types/teller';
import Decimal from 'decimal.js';
import { AppError } from '../../utils/errors';
import { parseOptionalNote, parsePositiveIntegerId } from '../transaction/transactionValidation';

const AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/;
const DIRECTIONS: readonly TellerDirection[] = ['DEPOSIT', 'WITHDRAWAL'];

export function parseTellerDirection(value: unknown): TellerDirection {
  if (typeof value !== 'string' || !DIRECTIONS.includes(value as TellerDirection)) {
    throw new AppError('INVALID_REQUEST', 'INVALID_REQUEST');
  }
  return value as TellerDirection;
}

export function parseOptionalTellerAmount(value: unknown): string | null {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0)) {
    return null;
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new AppError('VALIDATION_ERROR', 'AMOUNT_INVALID');
  }
  const trimmed = String(value).trim();
  if (!AMOUNT_PATTERN.test(trimmed)) {
    throw new AppError('VALIDATION_ERROR', 'AMOUNT_INVALID');
  }
  const amount = new Decimal(trimmed);
  if (!amount.isFinite() || amount.lt(0) || amount.decimalPlaces() > 4) {
    throw new AppError('VALIDATION_ERROR', 'AMOUNT_INVALID');
  }
  return trimmed;
}

export function parseRequiredTellerAmount(value: unknown, fallback = '0'): string {
  const parsed = parseOptionalTellerAmount(value);
  return parsed ?? fallback;
}

/** System-generated amounts (previous closing → OP). Never treated as user transaction input. */
export function parseTrustedTellerAmount(value: unknown, fallback = '0'): string {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0)) {
    return formatTellerAmount(new Decimal(fallback));
  }
  try {
    const amount = new Decimal(String(value).trim());
    if (!amount.isFinite()) {
      return formatTellerAmount(new Decimal(fallback));
    }
    return formatTellerAmount(amount);
  } catch {
    return formatTellerAmount(new Decimal(fallback));
  }
}

export function parsePieceCounts(value: unknown): Record<string, number> {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError('TELLER_DENOMINATION_INVALID', 'TELLER_DENOMINATION_INVALID');
  }

  const counts: Record<string, number> = {};
  for (const [rawKey, rawQuantity] of Object.entries(value as Record<string, unknown>)) {
    const key = rawKey.trim();
    if (key.length === 0) {
      throw new AppError('TELLER_DENOMINATION_INVALID', 'TELLER_DENOMINATION_INVALID');
    }
    if (rawQuantity === '' || rawQuantity === null || rawQuantity === undefined) {
      counts[key] = 0;
      continue;
    }
    const quantity =
      typeof rawQuantity === 'number' ? rawQuantity : Number.parseInt(String(rawQuantity).trim(), 10);
    if (!Number.isInteger(quantity)) {
      throw new AppError('TELLER_DENOMINATION_INVALID', 'NON_INTEGER_QUANTITY');
    }
    if (quantity < 0) {
      throw new AppError('TELLER_DENOMINATION_INVALID', 'NEGATIVE_QUANTITY');
    }
    counts[key] = quantity;
  }
  return counts;
}

export function parseOptionalSessionId(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return parsePositiveIntegerId(value, 'TELLER_SESSION_NOT_FOUND');
}

export function parseCurrencyCode(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError('INVALID_CURRENCY', 'CURRENCY_REQUIRED');
  }
  return value.trim().toUpperCase();
}

export function parseOptionalText(value: unknown, maxLength = 200): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'INVALID_REQUEST');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > maxLength) {
    throw new AppError('VALIDATION_ERROR', 'INVALID_REQUEST');
  }
  return trimmed;
}

export function parseSessionDate(value: unknown): string {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0)) {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    throw new AppError('VALIDATION_ERROR', 'INVALID_REQUEST');
  }
  return value.trim();
}

export { parseOptionalNote, parsePositiveIntegerId };
