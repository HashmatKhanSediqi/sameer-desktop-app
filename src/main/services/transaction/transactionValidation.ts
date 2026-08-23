import { AppError } from '../../utils/errors';
import type { TransactionType } from '@shared/types/transaction';
import Decimal from 'decimal.js';
import {
  nowSqliteDateTime,
  sqliteFromDateOnly,
  sqliteFromWallClockString,
  toSqliteDateTime,
} from '@shared/transactionDateTime';

const AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)?(?:Z|[+-]\d{2}:\d{2})?$/;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function parsePositiveIntegerId(value: unknown, invalidCode = 'INVALID_REQUEST'): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new AppError('VALIDATION_ERROR', invalidCode);
  }
  return value;
}

export function parseTransactionType(value: unknown): TransactionType {
  if (value !== 'CASH_IN' && value !== 'CASH_OUT') {
    throw new AppError('INVALID_TRANSACTION_TYPE', 'INVALID_TRANSACTION_TYPE');
  }
  return value;
}

export function parseAmount(value: unknown): string {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0)) {
    throw new AppError('VALIDATION_ERROR', 'AMOUNT_REQUIRED');
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new AppError('VALIDATION_ERROR', 'AMOUNT_INVALID');
    }
    throw new AppError('VALIDATION_ERROR', 'AMOUNT_INVALID');
  }

  if (typeof value !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'AMOUNT_INVALID');
  }

  const trimmed = value.trim();
  if (trimmed.toLowerCase() === 'nan' || trimmed.toLowerCase() === 'infinity' || trimmed.toLowerCase() === '-infinity') {
    throw new AppError('VALIDATION_ERROR', 'AMOUNT_INVALID');
  }

  if (!AMOUNT_PATTERN.test(trimmed)) {
    throw new AppError('VALIDATION_ERROR', 'AMOUNT_INVALID');
  }

  const amount = new Decimal(trimmed);
  if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > 4) {
    throw new AppError('VALIDATION_ERROR', 'AMOUNT_INVALID');
  }

  return trimmed;
}

export function parseCurrencyCode(value: unknown): string {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0)) {
    throw new AppError('VALIDATION_ERROR', 'CURRENCY_REQUIRED');
  }

  if (typeof value !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'CURRENCY_INVALID');
  }

  return value.trim().toUpperCase();
}

export function parseOptionalNote(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'INVALID_REQUEST');
  }

  if (value.includes('\u0000')) {
    throw new AppError('VALIDATION_ERROR', 'INVALID_CHARACTERS');
  }

  const normalized = value.replace(CONTROL_CHARS, '').trim();
  return normalized.length === 0 ? null : normalized;
}

export function parseTransactionDate(value: unknown): string {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0)) {
    return nowSqliteDateTime();
  }

  if (typeof value !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'INVALID_DATE');
  }

  const trimmed = value.trim();
  if (!ISO_DATE_PATTERN.test(trimmed)) {
    throw new AppError('VALIDATION_ERROR', 'INVALID_DATE');
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const dateOnly = sqliteFromDateOnly(trimmed);
    if (!dateOnly) {
      throw new AppError('VALIDATION_ERROR', 'INVALID_DATE');
    }
    return dateOnly;
  }

  const hasZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(trimmed);
  if (!hasZone) {
    const wallClock = sqliteFromWallClockString(trimmed);
    if (!wallClock) {
      throw new AppError('VALIDATION_ERROR', 'INVALID_DATE');
    }
    return wallClock;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError('VALIDATION_ERROR', 'INVALID_DATE');
  }

  return toSqliteDateTime(parsed);
}

export function parseOptionalPage(value: unknown, fallback: number): number {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new AppError('VALIDATION_ERROR', 'INVALID_REQUEST');
  }
  return value;
}
