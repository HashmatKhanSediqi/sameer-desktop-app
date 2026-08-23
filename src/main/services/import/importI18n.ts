import type { SupportedLocale } from '@shared/types/locale';
import importEn from '../../../renderer/i18n/locales/en/import.json';
import importFa from '../../../renderer/i18n/locales/fa-AF/import.json';
import importPs from '../../../renderer/i18n/locales/ps/import.json';

type JsonRecord = Record<string, unknown>;

const LOCALES: Record<SupportedLocale, JsonRecord> = {
  en: importEn as JsonRecord,
  'fa-AF': importFa as JsonRecord,
  ps: importPs as JsonRecord,
};

const ERROR_KEY_BY_CODE: Record<string, string> = {
  INVALID_FORMAT: 'error.invalidFormat',
  MISSING_SHEET: 'error.missingSheet',
  MISSING_HEADER: 'error.missingHeader',
  NO_DATA: 'error.noData',
  INVALID_TYPE: 'error.invalidType',
  INVALID_CURRENCY: 'error.invalidCurrency',
  INVALID_AMOUNT: 'error.invalidAmount',
  MISSING_CUSTOMER: 'error.missingCustomer',
  INVALID_DATE: 'error.invalidDate',
  DUPLICATE_CUSTOMER: 'error.duplicateCustomer',
  FILE_TOO_LARGE: 'error.fileTooLarge',
  TOO_MANY_ROWS: 'error.tooManyRows',
  INVALID_PHOTO: 'error.invalidPhoto',
  PATH_TRAVERSAL: 'error.pathTraversal',
  NAME_TOO_LONG: 'error.nameTooLong',
  CUSTOMER_NUMBER_TOO_LONG: 'error.customerNumberTooLong',
  INVALID_CUSTOMER_NUMBER: 'error.invalidCustomerNumber',
  INVALID_CHARACTERS: 'error.invalidCharacters',
  PARSE_TIMEOUT: 'error.parseTimeout',
  UNKNOWN_COLUMN: 'warning.unknownColumn',
  POSSIBLE_DUPLICATE: 'warning.possibleDuplicate',
};

export function importT(
  locale: SupportedLocale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const template = readKey(LOCALES[locale], key) ?? readKey(LOCALES.en, key) ?? key;
  if (!vars) {
    return template;
  }
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(vars[name] ?? ''));
}

export function importErrorMessage(
  locale: SupportedLocale,
  code: string,
  vars?: Record<string, string | number>,
): string {
  const key = ERROR_KEY_BY_CODE[code] ?? `error.${code}`;
  return importT(locale, key, vars);
}

function readKey(record: JsonRecord, key: string): string | undefined {
  const parts = key.split('.');
  let current: unknown = record;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    current = (current as JsonRecord)[part];
  }
  return typeof current === 'string' ? current : undefined;
}
