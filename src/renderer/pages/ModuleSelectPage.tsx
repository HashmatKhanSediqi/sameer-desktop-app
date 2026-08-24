import { useTranslation } from 'react-i18next';
import type { AppModule } from '../components/ModuleSwitcher';
import { LanguageSelector } from '../components/LanguageSelector';
import { useAuth } from '../context/AuthContext';

interface ModuleSelectPageProps {
  onSelect: (module: Exclude<AppModule, 'select'>) => void;
}

export function ModuleSelectPage({ onSelect }: ModuleSelectPageProps): JSX.Element {
  const { t } = useTranslation('common');
  const { username, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header app-header-bar">
        <div className="header-brand">
          <div>
            <h1>{t('appName')}</h1>
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
            <button type="button" className="module-card" onClick={() => onSelect('accounting')}>
              <span className="module-card-kicker">{t('appName')}</span>
              <span className="module-card-title">{t('modules.accounting')}</span>
              <span className="module-card-copy">{t('modules.accountingDescription')}</span>
              <span className="module-card-action">{t('modules.openAccounting')}</span>
            </button>
            <button type="button" className="module-card" onClick={() => onSelect('teller')}>
              <span className="module-card-kicker">{t('appName')}</span>
              <span className="module-card-title">{t('modules.teller')}</span>
              <span className="module-card-copy">{t('modules.tellerDescription')}</span>
              <span className="module-card-action">{t('modules.openTeller')}</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
