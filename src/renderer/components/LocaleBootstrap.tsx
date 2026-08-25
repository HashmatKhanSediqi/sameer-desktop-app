import { ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { applyThemeToDocument, DEFAULT_THEME } from '@shared/theme';
import { DEFAULT_LOCALE, normalizeLocale } from '@shared/types/locale';
import { applyDocumentLocale, changeAppLanguage } from '../i18n';

interface LocaleBootstrapProps {
  children: ReactNode;
}

export function LocaleBootstrap({ children }: LocaleBootstrapProps): JSX.Element {
  const { t } = useTranslation('common');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const result = await window.api.settings.get();
        if (cancelled) {
          return;
        }
        if (result.ok) {
          await changeAppLanguage(result.data.language);
          applyThemeToDocument(result.data.theme ?? DEFAULT_THEME, document.documentElement);
        } else {
          applyDocumentLocale(normalizeLocale(DEFAULT_LOCALE));
        }
      } catch {
        if (!cancelled) {
          applyDocumentLocale(DEFAULT_LOCALE);
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="login-page">
        <p>{t('loading')}</p>
      </div>
    );
  }

  return <>{children}</>;
}
