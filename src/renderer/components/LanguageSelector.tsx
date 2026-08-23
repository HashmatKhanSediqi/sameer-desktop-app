import { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES, normalizeLocale, type SupportedLocale } from '@shared/types/locale';
import { changeAppLanguage } from '../i18n';

export function LanguageSelector(): JSX.Element {
  const { t, i18n } = useTranslation('common');
  const locale = normalizeLocale(i18n.language);

  async function handleChange(event: ChangeEvent<HTMLSelectElement>): Promise<void> {
    const next = normalizeLocale(event.target.value);
    await persistAndApplyLanguage(next);
  }

  return (
    <label className="language-selector">
      <span className="visually-hidden">{t('language.label')}</span>
      <select
        value={locale}
        onChange={(event) => void handleChange(event)}
        aria-label={t('language.label')}
      >
        {SUPPORTED_LOCALES.map((code) => (
          <option key={code} value={code}>
            {t(`language.${code}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

export async function persistAndApplyLanguage(locale: SupportedLocale): Promise<void> {
  await changeAppLanguage(locale);
  const result = await window.api.settings.update({ language: locale });
  if (!result.ok) {
    console.warn('Failed to persist language', result.errorCode);
  }
}
