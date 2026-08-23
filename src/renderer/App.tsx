import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './context/AuthContext';
import { AppShell } from './pages/AppShell';
import { LoginPage } from './pages/LoginPage';
import { RecoveryPage } from './pages/auth/RecoveryPage';
import { RestorePage } from './pages/backup/RestorePage';
import { CompanySetupPage } from './pages/company/CompanySetupPage';

export function App(): JSX.Element {
  const { t } = useTranslation('common');
  const { isAuthenticated, isInitializing, sessionId, clearLocalSession } = useAuth();
  const [showRestore, setShowRestore] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [companyReady, setCompanyReady] = useState<boolean | null>(null);
  const [recovered, setRecovered] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !sessionId) {
      setCompanyReady(null);
      return;
    }
    let cancelled = false;
    void window.api.company.get({ sessionId }).then((result) => {
      if (!cancelled) {
        setCompanyReady(result.ok ? result.data.configured : true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, sessionId]);

  if (isInitializing) {
    return (
      <div className="login-page">
        <p>{t('loading')}</p>
      </div>
    );
  }

  if (showRestore) {
    return (
      <RestorePage
        variant="prelogin"
        onBack={() => setShowRestore(false)}
        onRestored={() => {
          clearLocalSession();
          setShowRestore(false);
          window.location.reload();
        }}
      />
    );
  }

  if (showRecovery) {
    return (
      <RecoveryPage
        onBack={() => setShowRecovery(false)}
        onRecovered={() => {
          setShowRecovery(false);
          setRecovered(true);
        }}
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <LoginPage
        onImportExisting={() => setShowRestore(true)}
        onForgotPassword={() => setShowRecovery(true)}
        recovered={recovered}
      />
    );
  }

  if (companyReady === false) {
    return <CompanySetupPage onSaved={() => setCompanyReady(true)} />;
  }

  if (companyReady === null) {
    return (
      <div className="login-page">
        <p>{t('loading')}</p>
      </div>
    );
  }

  return <AppShell />;
}
