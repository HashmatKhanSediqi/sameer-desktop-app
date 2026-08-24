import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CompanyProfile } from '@shared/types/company';
import type { AppModule } from '../components/ModuleSwitcher';
import { LanguageSelector } from '../components/LanguageSelector';
import { useAuth } from '../context/AuthContext';

interface ModuleSelectPageProps {
  onSelect: (module: Exclude<AppModule, 'select'>) => void;
}

export function ModuleSelectPage({ onSelect }: ModuleSelectPageProps): JSX.Element {
  const { t } = useTranslation('common');
  const { username, logout, sessionId } = useAuth();
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [logoSrc, setLogoSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    void window.api.company.get({ sessionId }).then((result) => {
      if (result.ok) {
        setCompany(result.data);
      }
    });
    void window.api.company.getLogo({ sessionId }).then((result) => {
      if (result.ok && result.data) {
        setLogoSrc(`data:${result.data.mimeType};base64,${result.data.dataBase64}`);
      }
    });
  }, [sessionId]);

  return (
    <div className="app-shell">
      <header className="app-header app-header-bar">
        <div className="header-brand">
          {logoSrc ? <img className="header-logo" src={logoSrc} alt="" /> : null}
          <div>
            <h1>{company?.name?.trim() || t('appName')}</h1>
            <p className="subtitle">{username ? t('signedInAs', { username }) : null}</p>
          </div>
        </div>
        <div className="header-toolbar">
          <LanguageSelector />
          <button type="button" className="button button-secondary" onClick={() => void logout()}>
            {t('logout')}
          </button>
        </div>
      </header>
      <main className="app-main module-select-main">
        <div className="module-select">
          <div className="module-select-intro">
            <h2>{t('modules.title')}</h2>
            <p>{t('modules.subtitle')}</p>
          </div>
          <div className="module-select-grid">
            <button
              type="button"
              className="module-card module-card-accounting"
              onClick={() => onSelect('accounting')}
            >
              <span className="module-card-icon" aria-hidden="true">
                <LedgerIcon />
              </span>
              <span className="module-card-title">{t('modules.accounting')}</span>
              <span className="module-card-copy">{t('modules.accountingDescription')}</span>
              <span className="module-card-action">
                {t('modules.openAccounting')}
                <ChevronIcon />
              </span>
            </button>
            <button type="button" className="module-card module-card-teller" onClick={() => onSelect('teller')}>
              <span className="module-card-icon" aria-hidden="true">
                <CashIcon />
              </span>
              <span className="module-card-title">{t('modules.teller')}</span>
              <span className="module-card-copy">{t('modules.tellerDescription')}</span>
              <span className="module-card-action">
                {t('modules.openTeller')}
                <ChevronIcon />
              </span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function LedgerIcon(): JSX.Element {
  return (
    <svg className="module-card-glyph" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="5" y="4.5" width="22" height="23" rx="3" stroke="currentColor" strokeWidth="1.75" />
      <path d="M5 10.5h22" stroke="currentColor" strokeWidth="1.75" />
      <path d="M11 16h10M11 20.5h7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="22.5" cy="20.5" r="1.35" fill="currentColor" />
    </svg>
  );
}

function CashIcon(): JSX.Element {
  return (
    <svg className="module-card-glyph" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="3.5" y="9" width="25" height="15.5" rx="3" stroke="currentColor" strokeWidth="1.75" />
      <rect x="7" y="7" width="18" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="16" cy="16.75" r="3.1" stroke="currentColor" strokeWidth="1.75" />
      <path d="M7.5 20.5h3.5M21 12.8h3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon(): JSX.Element {
  return (
    <svg className="module-card-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6 3.5 11 8l-5 4.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
