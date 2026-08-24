import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TellerLongBook } from '@shared/types/teller';
import { useAuth } from '../../context/AuthContext';
import { useLocaleFormat } from '../../hooks/useLocaleFormat';

interface TellerLongBookPageProps {
  refreshKey: number;
}

export function TellerLongBookPage({ refreshKey }: TellerLongBookPageProps): JSX.Element {
  const { t } = useTranslation('teller');
  const { t: tErrors } = useTranslation('errors');
  const { sessionId } = useAuth();
  const { formatMoney, formatDateTime } = useLocaleFormat();
  const [currencyCode, setCurrencyCode] = useState('AFN');
  const [page, setPage] = useState(1);
  const [book, setBook] = useState<TellerLongBook | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [currencyCode, refreshKey]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    void window.api.teller.getLongBook({ sessionId, currencyCode, page, pageSize: 50 }).then((result) => {
      if (result.ok) {
        setBook(result.data);
        setError(null);
      } else {
        setBook(null);
        setError(tErrors(result.errorCode));
      }
    });
  }, [sessionId, currencyCode, page, refreshKey, tErrors]);

  return (
    <section className="teller-panel">
      <header className="teller-panel-header">
        <h2>{t('longBook.title')}</h2>
        <label className="form-field teller-inline-field">
          <span>{t('form.currency')}</span>
          <select value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)}>
            <option value="AFN">AFN</option>
            <option value="USD">USD</option>
          </select>
        </label>
      </header>
      {error ? <p className="form-error">{error}</p> : null}
      {!book && !error ? <p className="empty-state">{t('longBook.empty')}</p> : null}
      {book ? (
        <>
          <div className="teller-metrics teller-metrics-row">
            <div>
              <dt>{t('longBook.opening')}</dt>
              <dd>{formatMoney(book.openingBalance)}</dd>
            </div>
            <div>
              <dt>{t('longBook.totalReceived')}</dt>
              <dd className="amount-in">{formatMoney(book.totalReceived)}</dd>
            </div>
            <div>
              <dt>{t('longBook.totalPaid')}</dt>
              <dd className="amount-out">{formatMoney(book.totalPaid)}</dd>
            </div>
            <div>
              <dt>{t('longBook.closing')}</dt>
              <dd>{formatMoney(book.closingBalance)}</dd>
            </div>
          </div>
          <div className="table-wrap">
          <table className="customer-table">
            <thead>
              <tr>
                <th>{t('history.date')}</th>
                <th>{t('history.type')}</th>
                <th>{t('longBook.received')}</th>
                <th>{t('longBook.paid')}</th>
                <th>{t('longBook.running')}</th>
              </tr>
            </thead>
            <tbody>
              {book.rows.map((row, index) => (
                <tr key={row.id ?? `opening-${index}`}>
                  <td>{formatDateTime(row.transactionDate)}</td>
                  <td>
                    {row.kind === 'OPENING'
                      ? t('longBook.kindOpening')
                      : row.kind === 'RECEIVED'
                        ? t('longBook.kindReceived')
                        : t('longBook.kindPaid')}
                    {row.transactionNumber ? ` · ${row.transactionNumber}` : ''}
                    {row.customerName ? ` · ${row.customerName}` : ''}
                  </td>
                  <td className="numeric amount-in">{row.kind === 'RECEIVED' ? formatMoney(row.received) : ''}</td>
                  <td className="numeric amount-out">{row.kind === 'PAID' ? formatMoney(row.paid) : ''}</td>
                  <td className="numeric">{formatMoney(row.runningBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="pagination-bar">
            <button type="button" className="button button-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              {t('history.page', { page: book.page, totalPages: book.totalPages })}
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={page >= book.totalPages}
              onClick={() => setPage(page + 1)}
            >
              →
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
