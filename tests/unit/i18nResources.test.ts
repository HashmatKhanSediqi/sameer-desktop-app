import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { I18N_NAMESPACES } from '../../src/shared/i18nNamespaces';
import { SUPPORTED_LOCALES } from '../../src/shared/types/locale';

const LOCALES_ROOT = join(process.cwd(), 'src', 'renderer', 'i18n', 'locales');

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => {
    const next = prefix ? `${prefix}.${key}` : key;
    if (nested !== null && typeof nested === 'object' && !Array.isArray(nested)) {
      return flattenKeys(nested, next);
    }
    return [next];
  });
}

function readNamespace(locale: string, namespace: string): Record<string, unknown> {
  const path = join(LOCALES_ROOT, locale, `${namespace}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

describe('i18n resource coverage', () => {
  it('has every required namespace for English, Dari, and Pashto', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const files = readdirSync(join(LOCALES_ROOT, locale));
      for (const namespace of I18N_NAMESPACES) {
        expect(files).toContain(`${namespace}.json`);
      }
    }
  });

  it('keeps Dari and Pashto keys in sync with English', () => {
    for (const namespace of I18N_NAMESPACES) {
      const englishKeys = flattenKeys(readNamespace('en', namespace)).sort();
      const dariKeys = flattenKeys(readNamespace('fa-AF', namespace)).sort();
      const pashtoKeys = flattenKeys(readNamespace('ps', namespace)).sort();
      expect(dariKeys).toEqual(englishKeys);
      expect(pashtoKeys).toEqual(englishKeys);
    }
  });

  it('keeps currency codes untranslated', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const transactions = readNamespace(locale, 'transactions') as {
        currencies: Record<string, string>;
      };
      expect(transactions.currencies.AFN).toBe('AFN');
      expect(transactions.currencies.USD).toBe('USD');
      expect(transactions.currencies.EUR).toBe('EUR');
    }
  });
});
