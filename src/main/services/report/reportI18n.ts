import type { SupportedLocale } from '@shared/types/locale';
import commonEn from '../../../renderer/i18n/locales/en/common.json';
import reportsEn from '../../../renderer/i18n/locales/en/reports.json';
import commonFa from '../../../renderer/i18n/locales/fa-AF/common.json';
import reportsFa from '../../../renderer/i18n/locales/fa-AF/reports.json';
import commonPs from '../../../renderer/i18n/locales/ps/common.json';
import reportsPs from '../../../renderer/i18n/locales/ps/reports.json';

type JsonRecord = Record<string, unknown>;

const LOCALES: Record<SupportedLocale, { common: JsonRecord; reports: JsonRecord }> = {
  en: { common: commonEn as JsonRecord, reports: reportsEn as JsonRecord },
  'fa-AF': { common: commonFa as JsonRecord, reports: reportsFa as JsonRecord },
  ps: { common: commonPs as JsonRecord, reports: reportsPs as JsonRecord },
};

export function reportT(
  locale: SupportedLocale,
  namespace: 'common' | 'reports',
  key: string,
  vars?: Record<string, string | number>,
): string {
  const bundle = LOCALES[locale][namespace];
  const fallback = LOCALES.en[namespace];
  const template = readKey(bundle, key) ?? readKey(fallback, key) ?? key;
  if (!vars) {
    return template;
  }
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(vars[name] ?? ''));
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
