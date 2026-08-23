import type Database from 'better-sqlite3';
import { SettingsRepository } from '../../database/repositories/settingsRepository';
import { AppError } from '../../utils/errors';
import { DEFAULT_LOCALE, isSupportedLocale, normalizeLocale } from '@shared/types/locale';
import {
  DEFAULT_THEME,
  isHexColor,
  parseThemeAppearance,
  type ThemeAppearance,
} from '@shared/theme';
import {
  DEFAULT_EXCHANGE_ENABLED,
  DEFAULT_PAGINATION_ENABLED,
  DEFAULT_PAGINATION_PAGE_SIZE,
  MAX_PAGINATION_PAGE_SIZE,
  MIN_PAGINATION_PAGE_SIZE,
  SETTINGS_CARD_TONES_KEY,
  SETTINGS_EXCHANGE_ENABLED_KEY,
  SETTINGS_LANGUAGE_KEY,
  SETTINGS_PAGINATION_ENABLED_KEY,
  SETTINGS_PAGINATION_PAGE_SIZE_KEY,
  SETTINGS_THEME_ACCENT_KEY,
  SETTINGS_THEME_PRIMARY_KEY,
  type AppSettings,
  type SettingsUpdateInput,
} from '@shared/types/settings';

export class SettingsService {
  private readonly repository: SettingsRepository;

  constructor(db: Database.Database) {
    this.repository = new SettingsRepository(db);
  }

  get(): AppSettings {
    return {
      language: normalizeLocale(this.repository.get(SETTINGS_LANGUAGE_KEY) ?? DEFAULT_LOCALE),
      paginationEnabled: this.readPaginationEnabled(),
      paginationPageSize: this.readPaginationPageSize(),
      exchangeEnabled: this.readExchangeEnabled(),
      theme: this.readTheme(),
    };
  }

  updateLanguage(language: string): AppSettings {
    if (!isSupportedLocale(language)) {
      throw new AppError('VALIDATION_ERROR', 'INVALID_LANGUAGE');
    }

    this.repository.set(SETTINGS_LANGUAGE_KEY, language);
    return this.get();
  }

  update(input: SettingsUpdateInput): AppSettings {
    if (
      input.language === undefined &&
      input.paginationEnabled === undefined &&
      input.paginationPageSize === undefined &&
      input.exchangeEnabled === undefined &&
      input.theme === undefined &&
      input.resetAppearance !== true
    ) {
      throw new AppError('INVALID_REQUEST', 'INVALID_REQUEST');
    }

    if (input.language !== undefined && !isSupportedLocale(input.language)) {
      throw new AppError('VALIDATION_ERROR', 'INVALID_LANGUAGE');
    }

    const pageSize =
      input.paginationPageSize === undefined ? undefined : this.parsePageSize(input.paginationPageSize);

    if (input.language !== undefined) {
      this.repository.set(SETTINGS_LANGUAGE_KEY, input.language);
    }

    if (input.paginationEnabled !== undefined) {
      this.repository.set(SETTINGS_PAGINATION_ENABLED_KEY, input.paginationEnabled ? 'true' : 'false');
    }

    if (pageSize !== undefined) {
      this.repository.set(SETTINGS_PAGINATION_PAGE_SIZE_KEY, String(pageSize));
    }

    if (input.exchangeEnabled !== undefined) {
      this.repository.set(SETTINGS_EXCHANGE_ENABLED_KEY, input.exchangeEnabled ? 'true' : 'false');
    }

    if (input.resetAppearance === true) {
      this.writeTheme(DEFAULT_THEME);
    } else if (input.theme !== undefined) {
      this.writeTheme(this.requireTheme(input.theme));
    }

    return this.get();
  }

  private readExchangeEnabled(): boolean {
    const raw = this.repository.get(SETTINGS_EXCHANGE_ENABLED_KEY);
    if (raw === undefined) {
      return DEFAULT_EXCHANGE_ENABLED;
    }
    return raw === 'true';
  }

  private readTheme(): ThemeAppearance {
    return parseThemeAppearance({
      primary: this.repository.get(SETTINGS_THEME_PRIMARY_KEY) ?? DEFAULT_THEME.primary,
      accent: this.repository.get(SETTINGS_THEME_ACCENT_KEY) ?? DEFAULT_THEME.accent,
      cards: this.parseCardTones(this.repository.get(SETTINGS_CARD_TONES_KEY)),
    });
  }

  private requireTheme(value: ThemeAppearance): ThemeAppearance {
    if (!isHexColor(value.primary) || !isHexColor(value.accent)) {
      throw new AppError('INVALID_COLOR', 'INVALID_COLOR');
    }
    for (const slot of ['1', '2', '3'] as const) {
      const tone = value.cards[slot];
      if (!tone || !isHexColor(tone.background) || !isHexColor(tone.accent)) {
        throw new AppError('INVALID_COLOR', 'INVALID_COLOR');
      }
    }
    return parseThemeAppearance(value);
  }

  private writeTheme(theme: ThemeAppearance): void {
    this.repository.set(SETTINGS_THEME_PRIMARY_KEY, theme.primary);
    this.repository.set(SETTINGS_THEME_ACCENT_KEY, theme.accent);
    this.repository.set(SETTINGS_CARD_TONES_KEY, JSON.stringify(theme.cards));
  }

  private parseCardTones(raw: string | undefined): unknown {
    if (!raw) {
      return DEFAULT_THEME.cards;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return DEFAULT_THEME.cards;
    }
  }

  private readPaginationEnabled(): boolean {
    const raw = this.repository.get(SETTINGS_PAGINATION_ENABLED_KEY);
    if (raw === undefined) {
      return DEFAULT_PAGINATION_ENABLED;
    }
    return raw !== 'false';
  }

  private readPaginationPageSize(): number {
    const raw = this.repository.get(SETTINGS_PAGINATION_PAGE_SIZE_KEY);
    const parsed = raw === undefined ? DEFAULT_PAGINATION_PAGE_SIZE : Number.parseInt(raw, 10);
    if (!Number.isInteger(parsed) || parsed < MIN_PAGINATION_PAGE_SIZE || parsed > MAX_PAGINATION_PAGE_SIZE) {
      return DEFAULT_PAGINATION_PAGE_SIZE;
    }
    return parsed;
  }

  private parsePageSize(value: number): number {
    if (!Number.isInteger(value) || value < MIN_PAGINATION_PAGE_SIZE || value > MAX_PAGINATION_PAGE_SIZE) {
      throw new AppError('VALIDATION_ERROR', 'INVALID_PAGE_SIZE');
    }
    return value;
  }
}
