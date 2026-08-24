import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CompanyProfile } from '@shared/types/company';
import { LanguageSelector } from '../../components/LanguageSelector';
import { ModuleSwitcher, type AppModule } from '../../components/ModuleSwitcher';
import { useAuth } from '../../context/AuthContext';
import { TellerCashForm } from './components/TellerCashForm';
import { TellerDashboardPage } from './TellerDashboardPage';
import { TellerHistoryPage } from './TellerHistoryPage';
import { TellerLongBookPage } from './TellerLongBookPage';
import { TellerTallyPage } from './TellerTallyPage';

type TellerView = 'dashboard' | 'cashIn' | 'cashOut' | 'tally' | 'longBook' | 'history';

interface TellerShellProps {
  onSwitchModule: (module: AppModule) => void;
}

export function TellerShell({ onSwitchModule }: TellerShellProps): JSX.Element {
  const { t } = useTranslation('teller');
  const { t: tCommon } = useTranslation('common');
  const { username, logout, sessionId } = useAuth();
  const [view, setView] = useState<TellerView>('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);
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

  function bump(): void {
    setRefreshKey((value) => value + 1);
  }

  return (
    <div className="app-shell">
      <header className="app-header app-header-bar">
        <div className="header-brand">
          {logoSrc ? <img className="header-logo" src={logoSrc} alt="" /> : null}
          <div>
            <h1>{company?.name?.trim() || tCommon('appName')}</h1>
            <p className="subtitle">{username ? tCommon('signedInAs', { username }) : null}</p>
          </div>
        </div>
        <div className="header-toolbar">
          <ModuleSwitcher current="teller" onSwitch={onSwitchModule} />
          <LanguageSelector />
          <button type="button" className="button button-secondary" onClick={() => void logout()}>
            {tCommon('logout')}
          </button>
        </div>
      </header>

      <nav className="teller-nav" aria-label={tCommon('modules.teller')}>
        {(
          [
            ['dashboard', t('nav.dashboard')],
            ['cashIn', t('nav.cashIn')],
            ['cashOut', t('nav.cashOut')],
            ['tally', t('nav.tally')],
            ['longBook', t('nav.longBook')],
            ['history', t('nav.history')],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={view === id ? 'teller-nav-btn is-active' : 'teller-nav-btn'}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="app-main teller-main">
        {view === 'dashboard' ? (
          <TellerDashboardPage refreshKey={refreshKey} onSessionChanged={bump} />
        ) : view === 'cashIn' ? (
          <section className="teller-panel">
            <h2>{t('nav.cashIn')}</h2>
            <TellerCashForm mode="in" onSaved={bump} />
          </section>
        ) : view === 'cashOut' ? (
          <section className="teller-panel">
            <h2>{t('nav.cashOut')}</h2>
            <TellerCashForm mode="out" onSaved={bump} />
          </section>
        ) : view === 'tally' ? (
          <TellerTallyPage refreshKey={refreshKey} />
        ) : view === 'longBook' ? (
          <TellerLongBookPage refreshKey={refreshKey} />
        ) : (
          <TellerHistoryPage refreshKey={refreshKey} />
        )}
      </main>
    </div>
  );
}
