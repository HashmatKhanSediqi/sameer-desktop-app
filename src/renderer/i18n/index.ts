import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
  DEFAULT_LOCALE,
  getDocumentDirection,
  normalizeLocale,
  type SupportedLocale,
} from '@shared/types/locale';
import { I18N_NAMESPACES, i18nResources } from './resources';

function isDevEnvironment(): boolean {
  return typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';
}

export function applyDocumentLocale(locale: SupportedLocale): void {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  root.lang = locale;
  root.dir = getDocumentDirection(locale);
  document.title = i18n.t('appName', { ns: 'common' });
}

export async function changeAppLanguage(locale: SupportedLocale): Promise<void> {
  await i18n.changeLanguage(locale);
  applyDocumentLocale(locale);
}

void i18n.use(initReactI18next).init({
  lng: DEFAULT_LOCALE,
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: [...I18N_NAMESPACES],
  resources: i18nResources,
  interpolation: {
    escapeValue: false,
  },
  saveMissing: isDevEnvironment(),
  missingKeyHandler: (_lngs, ns, key) => {
    if (isDevEnvironment()) {
      console.warn(`[i18n] Missing key ${ns}:${key}`);
    }
  },
});

i18n.on('languageChanged', (lng) => {
  applyDocumentLocale(normalizeLocale(lng));
});

applyDocumentLocale(DEFAULT_LOCALE);

export default i18n;
