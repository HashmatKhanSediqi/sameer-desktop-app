import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME } from '../../src/shared/theme';
import { SettingsService } from '../../src/main/services/settings/settingsService';
import { applyProjectMigrations, createTestDatabase } from '../helpers/testDatabase';

describe('SettingsService language persistence', () => {
  it('defaults to English and pagination settings from migrations', () => {
    const testDb = createTestDatabase();
    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const service = new SettingsService(testDb.db);
      expect(service.get()).toEqual({
        language: 'en',
        paginationEnabled: true,
        paginationPageSize: 10,
        exchangeEnabled: false,
        theme: DEFAULT_THEME,
      });
    } finally {
      testDb.cleanup();
    }
  });

  it('persists Dari and Pashto and can switch back to English', () => {
    const testDb = createTestDatabase();
    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const service = new SettingsService(testDb.db);

      expect(service.updateLanguage('fa-AF').language).toBe('fa-AF');
      expect(service.get().language).toBe('fa-AF');

      expect(service.updateLanguage('ps').language).toBe('ps');
      expect(service.get().language).toBe('ps');

      expect(service.updateLanguage('en').language).toBe('en');
      expect(service.get().language).toBe('en');
    } finally {
      testDb.cleanup();
    }
  });

  it('rejects unsupported language codes', () => {
    const testDb = createTestDatabase();
    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const service = new SettingsService(testDb.db);
      expect(() => service.updateLanguage('fr')).toThrowError(/INVALID_LANGUAGE/);
      expect(service.get().language).toBe('en');
    } finally {
      testDb.cleanup();
    }
  });

  it('persists pagination enabled and page size', () => {
    const testDb = createTestDatabase();
    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const service = new SettingsService(testDb.db);

      const updated = service.update({ paginationEnabled: false, paginationPageSize: 25 });
      expect(updated.paginationEnabled).toBe(false);
      expect(updated.paginationPageSize).toBe(25);
      expect(service.get().language).toBe('en');
    } finally {
      testDb.cleanup();
    }
  });

  it('persists exchange enabled and theme colors, then resets appearance', () => {
    const testDb = createTestDatabase();
    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const service = new SettingsService(testDb.db);

      const updated = service.update({
        exchangeEnabled: true,
        theme: {
          mode: 'light',
          primary: '#123456',
          accent: '#654321',
          cards: {
            '1': { background: '#111111', accent: '#222222' },
            '2': { background: '#333333', accent: '#444444' },
            '3': { background: '#555555', accent: '#666666' },
          },
        },
      });
      expect(updated.exchangeEnabled).toBe(true);
      expect(updated.theme.primary).toBe('#123456');
      expect(updated.theme.mode).toBe('light');
      expect(service.get().theme.cards['2'].accent).toBe('#444444');

      expect(() =>
        service.update({
          theme: {
            ...DEFAULT_THEME,
            primary: 'green',
          },
        }),
      ).toThrowError(/INVALID_COLOR/);
      expect(service.get().theme.primary).toBe('#123456');

      const reset = service.update({ resetAppearance: true });
      expect(reset.theme).toEqual(DEFAULT_THEME);
      expect(reset.exchangeEnabled).toBe(true);
    } finally {
      testDb.cleanup();
    }
  });

  it('persists dark mode independently of custom colors and restores light on reset', () => {
    const testDb = createTestDatabase();
    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const service = new SettingsService(testDb.db);

      const updated = service.update({
        theme: {
          ...DEFAULT_THEME,
          mode: 'dark',
          primary: '#123456',
        },
      });
      expect(updated.theme.mode).toBe('dark');
      expect(updated.theme.primary).toBe('#123456');
      expect(service.get().theme.mode).toBe('dark');

      const reset = service.update({ resetAppearance: true });
      expect(reset.theme).toEqual(DEFAULT_THEME);
      expect(reset.theme.mode).toBe('light');
    } finally {
      testDb.cleanup();
    }
  });

  it('rejects an out-of-range page size', () => {
    const testDb = createTestDatabase();
    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const service = new SettingsService(testDb.db);
      expect(() => service.update({ paginationPageSize: 3 })).toThrowError(/INVALID_PAGE_SIZE/);
      expect(service.get().paginationPageSize).toBe(10);
    } finally {
      testDb.cleanup();
    }
  });
});
