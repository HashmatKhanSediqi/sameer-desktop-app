import { toIntlLocale, type SupportedLocale } from './types/locale';

/**
 * Format a monetary decimal string for display.
 * Latin digits are forced so amounts stay readable inside RTL layouts.
 * Amounts should still be wrapped with dir="ltr" in the UI.
 */
export function formatMoneyForLocale(
  amount: string,
  locale: SupportedLocale,
  fractionDigits = 2,
): string {
  const value = Number.parseFloat(amount);
  if (!Number.isFinite(value)) {
    return amount;
  }

  return new Intl.NumberFormat(toIntlLocale(locale), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    numberingSystem: 'latn',
  }).format(value);
}

export function formatDateForLocale(value: string, locale: SupportedLocale): string {
  const parsed = parseLocaleDate(value);
  if (!parsed) {
    return value;
  }

  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    numberingSystem: 'latn',
  }).format(parsed);
}

export function formatTimeForLocale(value: string, locale: SupportedLocale): string {
  const parsed = parseLocaleDate(value);
  if (!parsed) {
    return value;
  }

  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    hour: '2-digit',
    minute: '2-digit',
    numberingSystem: 'latn',
  }).format(parsed);
}

export function formatDateTimeForLocale(value: string, locale: SupportedLocale): string {
  const parsed = parseLocaleDate(value);
  if (!parsed) {
    return value;
  }

  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    numberingSystem: 'latn',
  }).format(parsed);
}

function parseLocaleDate(value: string): Date | null {
  const parsed = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}
