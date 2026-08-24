import { describe, expect, it } from 'vitest';
import {
  nowSqliteDateTime,
  sqliteFromDateOnly,
  sqliteFromWallClockString,
  combineDateAndTime,
  resolveCreateDateTime,
  splitDateAndTime,
  toDateTimeLocalValue,
  toSqliteDateTime,
} from '../../src/shared/transactionDateTime';
import { parseAmount, parseTransactionDate } from '../../src/main/services/transaction/transactionValidation';
import { AppError } from '../../src/main/utils/errors';

describe('transaction date/time helpers', () => {
  it('formats local Date values as sortable SQLite datetime text', () => {
    const value = toSqliteDateTime(new Date(2026, 7, 22, 9, 5, 7));
    expect(value).toBe('2026-08-22 09:05:07');
  });

  it('converts stored datetimes to datetime-local input values', () => {
    expect(toDateTimeLocalValue('2026-08-22 14:30:45')).toBe('2026-08-22T14:30');
    expect(toDateTimeLocalValue('2026-08-22T08:15:00')).toBe('2026-08-22T08:15');
    expect(toDateTimeLocalValue('2026-08-22')).toBe('2026-08-22T00:00');
  });

  it('stores date-only values at midnight and wall-clock times as entered', () => {
    expect(sqliteFromDateOnly('2026-01-10')).toBe('2026-01-10 00:00:00');
    expect(sqliteFromWallClockString('2026-03-15T09:45')).toBe('2026-03-15 09:45:00');
    expect(sqliteFromWallClockString('2026-03-15 09:45:12')).toBe('2026-03-15 09:45:12');
    expect(sqliteFromDateOnly('2026-02-31')).toBeNull();
  });

  it('uses the current local time when a transaction date is omitted', () => {
    const before = nowSqliteDateTime();
    const parsed = parseTransactionDate(undefined);
    const after = nowSqliteDateTime();
    expect(parsed).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(parsed >= before).toBe(true);
    expect(parsed <= after).toBe(true);
  });

  it('parses datetime-local values without converting them through UTC', () => {
    expect(parseTransactionDate('2026-08-22T18:07')).toBe('2026-08-22 18:07:00');
  });

  it('combines optional date and time fields without overwriting a chosen value', () => {
    expect(combineDateAndTime('', '')).toBeUndefined();
    expect(combineDateAndTime('2026-01-10', '14:30')).toBe('2026-01-10T14:30');
    expect(combineDateAndTime('2024-12-31', '')).toBe('2024-12-31T00:00');
    expect(combineDateAndTime('', '08:15', new Date(2026, 7, 24, 12, 0, 0))).toBe('2026-08-24T08:15');
    expect(splitDateAndTime('2026-03-15 09:45:00')).toEqual({ date: '2026-03-15', time: '09:45' });
    expect(splitDateAndTime(undefined)).toEqual({ date: '', time: '' });
  });

  it('fills empty create fields with the current local date and time at resolve time', () => {
    const now = new Date(2026, 7, 25, 14, 7, 0);
    expect(resolveCreateDateTime('', '', now)).toEqual({
      date: '2026-08-25',
      time: '14:07',
      combined: '2026-08-25T14:07',
    });
  });

  it('preserves an explicit user date and time instead of overwriting with now', () => {
    const now = new Date(2026, 7, 25, 14, 7, 0);
    expect(resolveCreateDateTime('2024-12-31', '18:07', now)).toEqual({
      date: '2024-12-31',
      time: '18:07',
      combined: '2024-12-31T18:07',
    });
    expect(resolveCreateDateTime('2026-01-10', '', now)).toEqual({
      date: '2026-01-10',
      time: '00:00',
      combined: '2026-01-10T00:00',
    });
    expect(resolveCreateDateTime('', '08:15', now)).toEqual({
      date: '2026-08-25',
      time: '08:15',
      combined: '2026-08-25T08:15',
    });
  });
});

describe('parseAmount latin digits', () => {
  it('accepts latin digit amounts used by Decimal.js', () => {
    expect(parseAmount('10.25')).toBe('10.25');
  });

  it('rejects Eastern Arabic, Persian, and alphabetic amount text', () => {
    expect(() => parseAmount('۱۲۳')).toThrow(AppError);
    expect(() => parseAmount('١٢٣')).toThrow(AppError);
    expect(() => parseAmount('10الف')).toThrow(AppError);
  });
});
