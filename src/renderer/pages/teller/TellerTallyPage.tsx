import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Currency } from '@shared/types/currency';
import type { TellerTally } from '@shared/types/teller';
import { useAuth } from '../../context/AuthContext';
import { useLocaleFormat } from '../../hooks/useLocaleFormat';
import { TellerCurrencySelect } from './components/TellerCurrencySelect';

interface TellerTallyPageProps {
  refreshKey: number;
  currencies: Currency[];
  currencyCode: string;
  onCurrencyChange: (code: string) => void;
}

export function TellerTallyPage({
  refreshKey,
  currencies,
  currencyCode,
  onCurrencyChange,
}: TellerTallyPageProps): JSX.Element {
  const { t } = useTranslation('teller');
  const { t: tErrors } = useTranslation('errors');
  const { sessionId } = useAuth();
  const { formatMoney } = useLocaleFormat();
  const [tally, setTally] = useState<TellerTally | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || !currencyCode) {
      return;
    }
    void window.api.teller.getTally({ sessionId, currencyCode }).then((result) => {
      if (result.ok) {
        setTally(result.data);
        setError(null);
      } else {
        setTally(null);
        setError(tErrors(result.errorCode));
      }
    });
  }, [sessionId, currencyCode, refreshKey, tErrors]);

  return (
    <section className="teller-panel">
      <header className="teller-panel-header">
        <h2>{t('tally.title')}</h2>
        <label className="form-field teller-inline-field">
          <span>{t('form.currency')}</span>
          <TellerCurrencySelect currencies={currencies} value={currencyCode} onChange={onCurrencyChange} />
        </label>
      </header>
      {error ? <p className="form-error">{error}</p> : null}
      {!tally && !error ? <p className="empty-state">{t('tally.empty')}</p> : null}
      {tally ? (
        <>
          <div className="table-wrap">
            <table className="customer-table">
              <thead>
                <tr>
                  <th>{t('tally.denomination')}</th>
                  <th>{t('tally.received')}</th>
                  <th>{t('tally.paid')}</th>
                  <th>{t('tally.remaining')}</th>
                  <th>{t('tally.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {tally.rows.map((row) => (
                  <tr key={row.denominationId}>
                    <td>{formatMoney(row.value)}</td>
                    <td>{row.receivedPieces}</td>
                    <td>{row.paidPieces}</td>
                    <td>{row.remainingPieces}</td>
                    <td className="numeric">{formatMoney(row.remainingAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="teller-total-line">
            {t('tally.totalCash')}:{' '}
            <strong>
              {formatMoney(tally.totalCash)} {tally.currencyCode}
            </strong>
          </p>
        </>
      ) : null}
    </section>
  );
}
