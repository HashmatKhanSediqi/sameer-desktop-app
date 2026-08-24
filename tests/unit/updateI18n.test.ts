import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES_ROOT = join(process.cwd(), 'src', 'renderer', 'i18n', 'locales');

function readSettings(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(LOCALES_ROOT, locale, 'settings.json'), 'utf8')) as Record<
    string,
    unknown
  >;
}

function flatten(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => {
    const next = prefix ? `${prefix}.${key}` : key;
    if (nested !== null && typeof nested === 'object' && !Array.isArray(nested)) {
      return flatten(nested, next);
    }
    return [next];
  });
}

describe('update localization keys', () => {
  const required = [
    'updates.title',
    'updates.checkForUpdates',
    'updates.checking',
    'updates.download',
    'updates.restartAndInstall',
    'updates.states.idle',
    'updates.states.upToDate',
    'updates.states.available',
    'updates.states.downloading',
    'updates.states.ready',
    'updates.states.error',
    'updates.errors.backupFailed',
    'updates.errors.checkFailed',
  ];

  it('includes update UI keys in English, Dari, and Pashto', () => {
    for (const locale of ['en', 'fa-AF', 'ps'] as const) {
      const keys = new Set(flatten(readSettings(locale)));
      for (const key of required) {
        expect(keys.has(key)).toBe(true);
      }
    }
  });
});
