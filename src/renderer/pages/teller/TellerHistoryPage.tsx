import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Currency } from '@shared/types/currency';
import type { TellerDirection, TellerTransactionListItem } from '@shared/types/teller';
import { useAuth } from '../../context/AuthContext';
import { useLocaleFormat } from '../../hooks/useLocaleFormat';
import { TellerCurrencySelect } from './components/TellerCurrencySelect';
import { formatTellerMoney } from './tellerDisplay';

interface TellerHistoryPageProps {
  refreshKey: number;
  currencies: Currency[];
  currencyCode: string;
}

export function TellerHistoryPage({
  refreshKey,
  currencies,
  currencyCode,
}: TellerHistoryPageProps): JSX.Element {
  const { t } = useTranslation('teller');
  const { t: tErrors } = useTranslation('errors');
  const { sessionId } = useAuth();
  const { formatMoney, formatDateTime } = useLocaleFormat();
  const [rows, setRows] = useState<TellerTransactionListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [referenceLabel, setReferenceLabel] = useState('');
  const [filterAllCurrencies, setFilterAllCurrencies] = useState(false);
  const [direction, setDirection] = useState<'' | TellerDirection>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [activeCurrency, setActiveCurrency] = useState(currencyCode);

  useEffect(() => {
    setActiveCurrency(currencyCode);
  }, [currencyCode]);

  function load(nextPage = page): void {
    if (!sessionId) {
      return;
    }
    void window.api.teller
      .listTransactions({
        sessionId,
        page: nextPage,
        pageSize: 50,
        referenceLabel: referenceLabel.trim() || undefined,
        currencyCode: filterAllCurrencies ? undefined : activeCurrency || undefined,
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
  }, [sessionId, refreshKey, activeCurrency, filterAllCurrencies]);

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
          <span>{t('history.searchReference')}</span>
          <input value={referenceLabel} onChange={(event) => setReferenceLabel(event.target.value)} />
        </label>
        <label className="form-field">
          <span>{t('form.currency')}</span>
          <div className="teller-history-currency">
            <TellerCurrencySelect
              currencies={currencies}
              value={activeCurrency}
              onChange={(code) => {
                setFilterAllCurrencies(false);
                setActiveCurrency(code);
              }}
              disabled={filterAllCurrencies}
            />
            <label className="teller-inline-check">
              <input
                type="checkbox"
                checked={filterAllCurrencies}
                onChange={(event) => setFilterAllCurrencies(event.target.checked)}
              />
              {t('history.all')}
            </label>
          </div>
        </label>
        <label className="form-field">
          <span>{t('history.direction')}</span>
          <select value={direction} onChange={(event) => setDirection(event.target.value as '' | TellerDirection)}>
            <option value="">{t('history.all')}</option>
            <option value="DEPOSIT">{t('history.deposit')}</option>
            <option value="WITHDRAWAL">{t('history.withdrawal')}</option>
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
                <th>{t('history.direction')}</th>
                <th>{t('form.currency')}</th>
                <th>{t('history.reference')}</th>
                <th>{t('history.amount')}</th>
                <th>{t('sheet.check')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.sequenceNo || row.id}</td>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td>{row.direction === 'DEPOSIT' ? t('history.deposit') : t('history.withdrawal')}</td>
                  <td>{row.currencyCode}</td>
                  <td>{row.referenceLabel}</td>
                  <td className={row.direction === 'DEPOSIT' ? 'numeric amount-in' : 'numeric amount-out'}>
                    {formatTellerMoney(formatMoney, row.declaredAmount ?? row.countedTotal)}
                  </td>
                  <td className={row.check === 'NO' ? 'amount-out' : 'amount-in'}>{row.check}</td>
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
