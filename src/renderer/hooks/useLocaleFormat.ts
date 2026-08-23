import { useTranslation } from 'react-i18next';
import { formatDateForLocale, formatDateTimeForLocale, formatMoneyForLocale } from '@shared/localeFormat';
import { normalizeLocale } from '@shared/types/locale';

export function useLocaleFormat(): {
  formatMoney: (amount: string, fractionDigits?: number) => string;
  formatDate: (value: string) => string;
  formatDateTime: (value: string) => string;
} {
  const { i18n } = useTranslation();
  const locale = normalizeLocale(i18n.language);

  return {
    formatMoney: (amount: string, fractionDigits = 2): string =>
      formatMoneyForLocale(amount, locale, fractionDigits),
    formatDate: (value: string): string => formatDateForLocale(value, locale),
    formatDateTime: (value: string): string => formatDateTimeForLocale(value, locale),
  };
}
