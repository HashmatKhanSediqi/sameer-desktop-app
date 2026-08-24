import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CompanyProfile } from '@shared/types/company';
import { LanguageSelector } from '../components/LanguageSelector';
import { ModuleSwitcher, type AppModule } from '../components/ModuleSwitcher';
import { useAuth } from '../context/AuthContext';
import { CustomerDetailPage } from './customers/CustomerDetailPage';
import { CustomerListPage } from './customers/CustomerListPage';
import { ImportPage } from './import/ImportPage';
import { ReportsPage } from './reports/ReportsPage';
import { SettingsPage } from './settings/SettingsPage';

type ShellView =
  | { type: 'list' }
  | { type: 'detail'; customerId: number }
  | { type: 'settings' }
  | { type: 'reports'; customerId?: number }
  | { type: 'import' };

interface AppShellProps {
  onSwitchModule: (module: AppModule) => void;
}

export function AppShell({ onSwitchModule }: AppShellProps): JSX.Element {
  const { t: tCommon } = useTranslation('common');
  const { username, logout, sessionId } = useAuth();
  const [view, setView] = useState<ShellView>({ type: 'list' });
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
            <h1>{company?.name?.trim() || tCommon('appName')}</h1>
            <p className="subtitle">{username ? tCommon('signedInAs', { username }) : null}</p>
          </div>
        </div>
        <div className="header-toolbar">
          <ModuleSwitcher current="accounting" onSwitch={onSwitchModule} />
          <LanguageSelector />
          <button type="button" className="button button-secondary" onClick={() => setView({ type: 'import' })}>
            {tCommon('import')}
          </button>
          <button type="button" className="button button-secondary" onClick={() => setView({ type: 'reports' })}>
            {tCommon('reports')}
          </button>
          <button type="button" className="button button-secondary" onClick={() => setView({ type: 'settings' })}>
            {tCommon('settings')}
          </button>
          <button type="button" className="button button-secondary" onClick={() => void logout()}>
            {tCommon('logout')}
          </button>
        </div>
      </header>

      <main className={view.type === 'detail' ? 'app-main app-main-detail' : 'app-main'}>
        {view.type === 'list' ? (
          <CustomerListPage
            onViewCustomer={(customerId) => setView({ type: 'detail', customerId })}
            onOpenReports={() => setView({ type: 'reports' })}
            onOpenImport={() => setView({ type: 'import' })}
          />
        ) : view.type === 'detail' ? (
          <CustomerDetailPage
            customerId={view.customerId}
            onBack={() => setView({ type: 'list' })}
            onDeleted={() => setView({ type: 'list' })}
          />
        ) : view.type === 'reports' ? (
          <ReportsPage onBack={() => setView({ type: 'list' })} initialCustomerId={view.customerId} />
        ) : view.type === 'import' ? (
          <ImportPage onBack={() => setView({ type: 'list' })} onImported={() => setView({ type: 'list' })} />
        ) : (
          <SettingsPage onBack={() => setView({ type: 'list' })} />
        )}
      </main>
    </div>
  );
}
