import { describe, expect, it } from 'vitest';
import {
  formatDateForLocale,
  formatDateTimeForLocale,
  formatMoneyForLocale,
  formatTimeForLocale,
} from '../../src/shared/localeFormat';

describe('locale-aware formatting', () => {
  it('formats amounts with latin digits for all UI languages', () => {
    const formatted = formatMoneyForLocale('1250000.5', 'fa-AF');
    expect(formatted).toMatch(/1/);
    expect(formatted).not.toMatch(/[۰-۹٠-٩]/);
    expect(formatMoneyForLocale('3500', 'en')).toContain('3,500.00');
  });

  it('formats dates without throwing for each locale', () => {
    const value = '2026-08-21 10:00:00';
    expect(formatDateForLocale(value, 'en')).toMatch(/2026/);
    expect(formatDateForLocale(value, 'fa-AF').length).toBeGreaterThan(0);
    expect(formatDateForLocale(value, 'ps').length).toBeGreaterThan(0);
  });

  it('formats a time with latin digits', () => {
    const formatted = formatTimeForLocale('2026-08-21 14:30:00', 'en');
    expect(formatted).toMatch(/2/);
    expect(formatted).not.toMatch(/[۰-۹٠-٩]/);
  });

  it('formats transaction date and time with latin digits', () => {
    const value = '2026-08-21 14:30:00';
    const english = formatDateTimeForLocale(value, 'en');
    expect(english).toMatch(/2026/);
    expect(english).toMatch(/2/);
    expect(english).not.toMatch(/[۰-۹٠-٩]/);
    expect(formatDateTimeForLocale(value, 'fa-AF')).not.toMatch(/[۰-۹٠-٩]/);
    expect(formatDateTimeForLocale(value, 'ps').length).toBeGreaterThan(0);
  });

  it('returns the original string when a date cannot be parsed', () => {
    expect(formatDateForLocale('not-a-date', 'en')).toBe('not-a-date');
  });
});
