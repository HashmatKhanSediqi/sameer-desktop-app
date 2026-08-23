import { describe, expect, it } from 'vitest';
import { isLatinAmountInsert, sanitizeAmountInput } from '../../src/shared/amountInput';

describe('sanitizeAmountInput', () => {
  it('keeps latin digits and a single decimal point', () => {
    expect(sanitizeAmountInput('1234.5678')).toBe('1234.5678');
    expect(sanitizeAmountInput('0.5')).toBe('0.5');
  });

  it('rejects Dari, Persian, Arabic numerals and letters', () => {
    expect(sanitizeAmountInput('۱۲۳۴')).toBe('');
    expect(sanitizeAmountInput('١٢٣')).toBe('');
    expect(sanitizeAmountInput('۱۰۰.۵')).toBe('.');
    expect(sanitizeAmountInput('abc')).toBe('');
    expect(sanitizeAmountInput('مبلغ')).toBe('');
    expect(sanitizeAmountInput('10abc.25xyz')).toBe('10.25');
  });

  it('drops extra decimal points and digits beyond 4 decimal places', () => {
    expect(sanitizeAmountInput('1.2.3')).toBe('1.23');
    expect(sanitizeAmountInput('1.123456')).toBe('1.1234');
  });

  it('does not accept a minus sign or grouping separators', () => {
    expect(sanitizeAmountInput('-10')).toBe('10');
    expect(sanitizeAmountInput('1,000.50')).toBe('1000.50');
  });

  it('identifies insert data that contains no latin amount characters', () => {
    expect(isLatinAmountInsert('9')).toBe(true);
    expect(isLatinAmountInsert('.')).toBe(true);
    expect(isLatinAmountInsert('۱۲')).toBe(false);
    expect(isLatinAmountInsert('abc')).toBe(false);
  });
});
