import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CompanyProfile } from '@shared/types/company';
import type { Currency } from '@shared/types/currency';
import type { TellerDashboard } from '@shared/types/teller';
import { LanguageSelector } from '../../components/LanguageSelector';
import { ModuleSwitcher, type AppModule } from '../../components/ModuleSwitcher';
import { useAuth } from '../../context/AuthContext';
import { TellerCashForm } from './components/TellerCashForm';
import { TellerSummaryBar } from './components/TellerSummaryBar';
import { OpenSessionForm } from './components/OpenSessionForm';
import { TellerHistoryPage } from './TellerHistoryPage';
import { TellerLongBookPage } from './TellerLongBookPage';
import { TellerTallyPage } from './TellerTallyPage';

type TellerView = 'workspace' | 'tally' | 'longBook' | 'history';

interface TellerShellProps {
  onSwitchModule: (module: AppModule) => void;
}

export function TellerShell({ onSwitchModule }: TellerShellProps): JSX.Element {
  const { t } = useTranslation('teller');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const { username, logout, sessionId } = useAuth();
  const [view, setView] = useState<TellerView>('workspace');
  const [mode, setMode] = useState<'in' | 'out'>('in');
  const [refreshKey, setRefreshKey] = useState(0);
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [currencyCode, setCurrencyCode] = useState('AFN');
  const [dashboard, setDashboard] = useState<TellerDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

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

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    void window.api.currencies.list({ sessionId }).then((result) => {
      if (result.ok) {
        setCurrencies(result.data.currencies);
        setCurrencyCode((current) =>
          result.data.currencies.some((item) => item.code === current)
            ? current
            : result.data.currencies[0]?.code ?? current,
        );
      }
    });
  }, [sessionId, refreshKey]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    void window.api.teller.getDashboard({ sessionId }).then((result) => {
      if (result.ok) {
        setDashboard(result.data);
        setError(null);
      } else {
        setError(tErrors(result.errorCode));
      }
    });
  }, [sessionId, refreshKey, tErrors]);

  function bump(): void {
    setRefreshKey((value) => value + 1);
  }

  async function closeSession(): Promise<void> {
    if (!sessionId || !dashboard?.session || closing) {
      return;
    }
    if (!window.confirm(t('session.confirmClose'))) {
      return;
    }
    setClosing(true);
    const result = await window.api.teller.closeSession({
      sessionId,
      tellerSessionId: dashboard.session.id,
    });
    setClosing(false);
    if (!result.ok) {
      setError(tErrors(result.errorCode));
      return;
    }
    bump();
  }

  const summary = dashboard?.currencies.find((row) => row.currencyCode === currencyCode) ?? dashboard?.currencies[0] ?? null;

  return (
    <div className="app-shell app-shell-teller">
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

      <TellerSummaryBar
        session={dashboard?.session ?? null}
        currencies={currencies}
        currencyCode={currencyCode}
        summary={summary}
        onCurrencyChange={setCurrencyCode}
        onCashIn={() => {
          setMode('in');
          setView('workspace');
        }}
        onCashOut={() => {
          setMode('out');
          setView('workspace');
        }}
        onCloseSession={() => void closeSession()}
        closing={closing}
      />

      <nav className="teller-nav" aria-label={tCommon('modules.teller')}>
        {(
          [
            ['workspace', t('nav.workspace')],
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
        {error ? <p className="form-error">{error}</p> : null}
        {view === 'workspace' ? (
          <section className="teller-panel">
            {dashboard?.session ? (
              <>
                <header className="teller-panel-header">
                  <h2>{mode === 'in' ? t('nav.cashIn') : t('nav.cashOut')}</h2>
                </header>
                <TellerCashForm
                  mode={mode}
                  currencies={currencies}
                  currencyCode={currencyCode}
                  onCurrencyChange={setCurrencyCode}
                  onSaved={bump}
                />
              </>
            ) : (
              <OpenSessionForm currencies={currencies} onOpened={bump} />
            )}
          </section>
        ) : view === 'tally' ? (
          <TellerTallyPage refreshKey={refreshKey} currencies={currencies} currencyCode={currencyCode} onCurrencyChange={setCurrencyCode} />
        ) : view === 'longBook' ? (
          <TellerLongBookPage refreshKey={refreshKey} currencies={currencies} currencyCode={currencyCode} onCurrencyChange={setCurrencyCode} />
        ) : (
          <TellerHistoryPage refreshKey={refreshKey} currencies={currencies} currencyCode={currencyCode} onCurrencyChange={setCurrencyCode} />
        )}
      </main>
    </div>
  );
}
