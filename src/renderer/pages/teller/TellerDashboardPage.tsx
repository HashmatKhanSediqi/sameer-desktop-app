import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TellerDashboard } from '@shared/types/teller';
import { amountsEqual } from '@shared/teller/denominationMath';
import { useAuth } from '../../context/AuthContext';
import { useLocaleFormat } from '../../hooks/useLocaleFormat';
import { OpenSessionForm } from './components/OpenSessionForm';
import { ZERO_BALANCE } from '@shared/money';

interface TellerDashboardPageProps {
  refreshKey: number;
  onSessionChanged: () => void;
}

export function TellerDashboardPage({ refreshKey, onSessionChanged }: TellerDashboardPageProps): JSX.Element {
  const { t } = useTranslation('teller');
  const { t: tErrors } = useTranslation('errors');
  const { sessionId } = useAuth();
  const { formatMoney, formatDateTime } = useLocaleFormat();
  const [data, setData] = useState<TellerDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    void window.api.teller.getDashboard({ sessionId }).then((result) => {
      if (result.ok) {
        setData(result.data);
        setError(null);
      } else {
        setError(tErrors(result.errorCode));
      }
    });
  }, [sessionId, refreshKey, tErrors]);

  async function closeSession(): Promise<void> {
    if (!sessionId || !data?.session || closing) {
      return;
    }
    if (!window.confirm(t('session.confirmClose'))) {
      return;
    }
    setClosing(true);
    const result = await window.api.teller.closeSession({
      sessionId,
      tellerSessionId: data.session.id,
    });
    setClosing(false);
    if (!result.ok) {
      setError(tErrors(result.errorCode));
      return;
    }
    onSessionChanged();
  }

  if (error) {
    return <p className="form-error">{error}</p>;
  }
  if (!data) {
    return <p>{t('session.none')}</p>;
  }

  return (
    <div className="teller-dashboard">
      <section className="teller-session-card">
        <div>
          <h2>{t('dashboard.title')}</h2>
          {data.session ? (
            <p className="subtitle">
              {t('session.statusOpen')} · {t('session.openedAt')} {formatDateTime(data.session.openedAt)}
            </p>
          ) : (
            <p className="subtitle">{t('session.noneHint')}</p>
          )}
        </div>
        {data.session ? (
          <button type="button" className="button button-secondary" onClick={() => void closeSession()} disabled={closing}>
            {t('session.close')}
          </button>
        ) : null}
      </section>

      {!data.session ? <OpenSessionForm onOpened={onSessionChanged} /> : null}

      <div className="teller-currency-grid">
        {data.currencies.map((row) => {
          const balanced = amountsEqual(row.difference, ZERO_BALANCE);
          return (
            <article key={row.currencyCode} className="teller-currency-card">
              <header>
                <h3>{row.currencyCode}</h3>
                <span className={balanced ? 'teller-pill is-ok' : 'teller-pill is-warn'}>
                  {balanced ? t('dashboard.matched') : t('dashboard.unmatched')}
                </span>
              </header>
              <dl className="teller-metrics">
                <div>
                  <dt>{t('dashboard.cashIn')}</dt>
                  <dd className="amount-in">{formatMoney(row.cashIn)}</dd>
                </div>
                <div>
                  <dt>{t('dashboard.cashOut')}</dt>
                  <dd className="amount-out">{formatMoney(row.cashOut)}</dd>
                </div>
                <div>
                  <dt>{t('dashboard.currentBalance')}</dt>
                  <dd>{formatMoney(row.currentBalance)}</dd>
                </div>
                <div>
                  <dt>{t('dashboard.transactionCount')}</dt>
                  <dd>{row.transactionCount}</dd>
                </div>
                <div>
                  <dt>{t('dashboard.physicalTally')}</dt>
                  <dd>{formatMoney(row.physicalTally)}</dd>
                </div>
                <div>
                  <dt>{t('dashboard.difference')}</dt>
                  <dd className={balanced ? undefined : 'amount-out'}>{formatMoney(row.difference)}</dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </div>
  );
}
