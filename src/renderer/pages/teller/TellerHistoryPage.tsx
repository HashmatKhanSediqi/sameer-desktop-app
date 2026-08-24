import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TellerTransactionListItem, TellerTransactionTypeCode } from '@shared/types/teller';
import { useAuth } from '../../context/AuthContext';
import { useLocaleFormat } from '../../hooks/useLocaleFormat';

const TYPE_KEYS: Record<TellerTransactionTypeCode, string> = {
  CUSTOMER_CASH_IN: 'type.customerCashIn',
  CUSTOMER_CASH_OUT: 'type.customerCashOut',
  HEAD_TELLER_IN: 'type.headTellerIn',
  HEAD_TELLER_OUT: 'type.headTellerOut',
  INTERNAL_TRANSFER_IN: 'type.internalTransferIn',
  INTERNAL_TRANSFER_OUT: 'type.internalTransferOut',
  OPENING_BALANCE: 'type.openingBalance',
  ADJUSTMENT_IN: 'type.adjustmentIn',
  ADJUSTMENT_OUT: 'type.adjustmentOut',
};

interface TellerHistoryPageProps {
  refreshKey: number;
}

export function TellerHistoryPage({ refreshKey }: TellerHistoryPageProps): JSX.Element {
  const { t } = useTranslation('teller');
  const { t: tErrors } = useTranslation('errors');
  const { sessionId } = useAuth();
  const { formatMoney, formatDateTime } = useLocaleFormat();
  const [rows, setRows] = useState<TellerTransactionListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [transactionNumber, setTransactionNumber] = useState('');
  const [currencyCode, setCurrencyCode] = useState('');
  const [direction, setDirection] = useState<'' | 'IN' | 'OUT'>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  function load(nextPage = page): void {
    if (!sessionId) {
      return;
    }
    void window.api.teller
      .listTransactions({
        sessionId,
        page: nextPage,
        pageSize: 50,
        transactionNumber: transactionNumber.trim() || undefined,
        currencyCode: currencyCode || undefined,
        direction: direction || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      })
      .then((result) => {
        if (result.ok) {
          setRows(result.data.transactions);
          setPage(result.data.page);
          setTotalPages(result.data.totalPages);
          setError(null);
        } else {
          setError(tErrors(result.errorCode));
        }
      });
  }

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, refreshKey]);

  function handleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    load(1);
  }

  return (
    <section className="teller-panel">
      <header className="teller-panel-header">
        <h2>{t('history.title')}</h2>
      </header>
      <form className="teller-filter-bar" onSubmit={handleSearch}>
        <label className="form-field">
          <span>{t('history.searchNumber')}</span>
          <input value={transactionNumber} onChange={(event) => setTransactionNumber(event.target.value)} />
        </label>
        <label className="form-field">
          <span>{t('form.currency')}</span>
          <select value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)}>
            <option value="">{t('history.all')}</option>
            <option value="AFN">AFN</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <label className="form-field">
          <span>{t('history.direction')}</span>
          <select value={direction} onChange={(event) => setDirection(event.target.value as '' | 'IN' | 'OUT')}>
            <option value="">{t('history.all')}</option>
            <option value="IN">{t('nav.cashIn')}</option>
            <option value="OUT">{t('nav.cashOut')}</option>
          </select>
        </label>
        <label className="form-field">
          <span>{t('history.dateFrom')}</span>
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </label>
        <label className="form-field">
          <span>{t('history.dateTo')}</span>
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </label>
        <button type="submit" className="button button-primary">
          {t('history.apply')}
        </button>
      </form>
      {error ? <p className="form-error">{error}</p> : null}
      {rows.length === 0 && !error ? <p className="empty-state">{t('history.empty')}</p> : null}
      {rows.length > 0 ? (
        <div className="table-wrap">
        <table className="customer-table">
          <thead>
            <tr>
              <th>{t('history.number')}</th>
              <th>{t('history.date')}</th>
              <th>{t('history.type')}</th>
              <th>{t('form.currency')}</th>
              <th>{t('history.customer')}</th>
              <th>{t('history.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.transactionNumber}</td>
                <td>{formatDateTime(row.transactionDate)}</td>
                <td>{t(TYPE_KEYS[row.typeCode])}</td>
                <td>{row.currencyCode}</td>
                <td>{row.customerName ?? (row.partyKind === 'HEAD_TELLER' ? t('form.partyHeadTeller') : '—')}</td>
                <td className={row.direction === 'IN' ? 'numeric amount-in' : row.direction === 'OUT' ? 'numeric amount-out' : 'numeric'}>
                  {formatMoney(row.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      ) : null}
      <div className="pagination-bar">
        <button type="button" className="button button-secondary" disabled={page <= 1} onClick={() => load(page - 1)}>
          {t('history.page', { page, totalPages })}
        </button>
        <button type="button" className="button button-secondary" disabled={page >= totalPages} onClick={() => load(page + 1)}>
          →
        </button>
      </div>
    </section>
  );
}
