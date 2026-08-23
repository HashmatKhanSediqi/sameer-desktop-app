export const SUPPORTED_LOCALES = ['en', 'fa-AF', 'ps'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en';

export const RTL_LOCALES: ReadonlySet<SupportedLocale> = new Set(['fa-AF', 'ps']);

/**
 * Intl locale mapping (localization.md §12).
 * English uses en-US rather than en-GB.
 */
export const INTL_LOCALE_BY_APP_LOCALE: Record<SupportedLocale, string> = {
  en: 'en-US',
  'fa-AF': 'fa-AF',
  ps: 'ps-AF',
};

export function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function normalizeLocale(value: string | null | undefined): SupportedLocale {
  if (value && isSupportedLocale(value)) {
    return value;
  }
  return DEFAULT_LOCALE;
}

export function isRtlLocale(locale: SupportedLocale): boolean {
  return RTL_LOCALES.has(locale);
}

export function toIntlLocale(locale: SupportedLocale): string {
  return INTL_LOCALE_BY_APP_LOCALE[locale];
}

export function getDocumentDirection(locale: SupportedLocale): 'rtl' | 'ltr' {
  return isRtlLocale(locale) ? 'rtl' : 'ltr';
}
