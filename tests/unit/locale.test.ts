import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  getDocumentDirection,
  isRtlLocale,
  isSupportedLocale,
  normalizeLocale,
  toIntlLocale,
} from '../../src/shared/types/locale';

describe('locale helpers', () => {
  it('recognizes supported locales', () => {
    expect(isSupportedLocale('en')).toBe(true);
    expect(isSupportedLocale('fa-AF')).toBe(true);
    expect(isSupportedLocale('ps')).toBe(true);
    expect(isSupportedLocale('fr')).toBe(false);
  });

  it('defaults unknown values to English', () => {
    expect(normalizeLocale(undefined)).toBe(DEFAULT_LOCALE);
    expect(normalizeLocale('nope')).toBe('en');
    expect(normalizeLocale('fa-AF')).toBe('fa-AF');
  });

  it('maps RTL for Dari and Pashto and LTR for English', () => {
    expect(isRtlLocale('en')).toBe(false);
    expect(isRtlLocale('fa-AF')).toBe(true);
    expect(isRtlLocale('ps')).toBe(true);
    expect(getDocumentDirection('en')).toBe('ltr');
    expect(getDocumentDirection('fa-AF')).toBe('rtl');
    expect(getDocumentDirection('ps')).toBe('rtl');
  });

  it('maps app locales to documented Intl locales', () => {
    expect(toIntlLocale('en')).toBe('en-US');
    expect(toIntlLocale('fa-AF')).toBe('fa-AF');
    expect(toIntlLocale('ps')).toBe('ps-AF');
  });
});
