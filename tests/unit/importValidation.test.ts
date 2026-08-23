import { describe, expect, it } from 'vitest';
import {
  parseImportAmount,
  parseImportCurrency,
  parseImportDate,
  parseImportType,
  resolveRelativePhotoPath,
} from '../../src/main/services/import/importValidation';

describe('import validation', () => {
  it('accepts Cash In aliases and rejects unknown types', () => {
    expect(parseImportType('CASH_IN')).toEqual({ ok: true, value: 'CASH_IN' });
    expect(parseImportType('Cash In')).toEqual({ ok: true, value: 'CASH_IN' });
    expect(parseImportType('cash-out')).toEqual({ ok: true, value: 'CASH_OUT' });
    expect(parseImportType('deposit')).toEqual({ ok: false, code: 'INVALID_TYPE' });
  });

  it('requires an active currency code', () => {
    const active = new Set(['AFN', 'USD', 'EUR']);
    expect(parseImportCurrency('usd', active)).toEqual({ ok: true, value: 'USD' });
    expect(parseImportCurrency('GBP', active)).toEqual({ ok: false, code: 'INVALID_CURRENCY' });
  });

  it('rejects invalid amounts', () => {
    expect(parseImportAmount('50000').ok).toBe(true);
    expect(parseImportAmount(250.5)).toEqual({ ok: true, value: '250.5' });
    expect(parseImportAmount('0')).toEqual({ ok: false, code: 'INVALID_AMOUNT' });
    expect(parseImportAmount(-1)).toEqual({ ok: false, code: 'INVALID_AMOUNT' });
    expect(parseImportAmount('abc')).toEqual({ ok: false, code: 'INVALID_AMOUNT' });
    expect(parseImportAmount('1.23456')).toEqual({ ok: false, code: 'INVALID_AMOUNT' });
  });

  it('parses ISO dates and rejects invalid dates', () => {
    const fallback = '2026-08-22 00:00:00';
    expect(parseImportDate('2025-01-15', fallback)).toEqual({ ok: true, value: '2025-01-15 00:00:00' });
    expect(parseImportDate('', fallback)).toEqual({ ok: true, value: fallback });
    expect(parseImportDate('2025-13-40', fallback)).toEqual({ ok: false, code: 'INVALID_DATE' });
    expect(parseImportDate('not-a-date', fallback)).toEqual({ ok: false, code: 'INVALID_DATE' });
  });

  it('rejects photo path traversal', () => {
    const result = resolveRelativePhotoPath('C:\\data\\file.xlsx', '..\\..\\Windows\\win.ini');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('PATH_TRAVERSAL');
    }
  });
});
