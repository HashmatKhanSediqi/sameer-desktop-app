import type { SupportedLocale } from './locale';
import type { ThemeAppearance } from '../theme';

export const SETTINGS_LANGUAGE_KEY = 'language';
export const SETTINGS_PAGINATION_ENABLED_KEY = 'pagination_enabled';
export const SETTINGS_PAGINATION_PAGE_SIZE_KEY = 'pagination_page_size';
export const SETTINGS_EXCHANGE_ENABLED_KEY = 'exchange_enabled';
export const SETTINGS_THEME_PRIMARY_KEY = 'theme_primary';
export const SETTINGS_THEME_ACCENT_KEY = 'theme_accent';
export const SETTINGS_THEME_MODE_KEY = 'theme_mode';
export const SETTINGS_CARD_TONES_KEY = 'card_tones';

export const DEFAULT_PAGINATION_ENABLED = true;
export const DEFAULT_PAGINATION_PAGE_SIZE = 10;
export const MIN_PAGINATION_PAGE_SIZE = 5;
export const MAX_PAGINATION_PAGE_SIZE = 100;
export const PAGINATION_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
export const DEFAULT_EXCHANGE_ENABLED = false;

export interface AppSettings {
  language: SupportedLocale;
  paginationEnabled: boolean;
  paginationPageSize: number;
  exchangeEnabled: boolean;
  theme: ThemeAppearance;
}

export interface SettingsUpdateInput {
  language?: SupportedLocale;
  paginationEnabled?: boolean;
  paginationPageSize?: number;
  exchangeEnabled?: boolean;
  theme?: ThemeAppearance;
  resetAppearance?: boolean;
}
