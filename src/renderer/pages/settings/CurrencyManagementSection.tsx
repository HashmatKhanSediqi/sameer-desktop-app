import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Currency } from '@shared/types/currency';
import { useAuth } from '../../context/AuthContext';
import { ConfirmDialog } from '../customers/components/ConfirmDialog';

interface CurrencyManagementSectionProps {
  currencies: Currency[];
  onReload: () => Promise<void>;
  mapError: (errorCode: string, message?: string) => string;
}
export function CurrencyManagementSection({
  currencies,
  onReload,
  mapError,
}: CurrencyManagementSectionProps): JSX.Element {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { sessionId } = useAuth();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [pendingDeactivate, setPendingDeactivate] = useState<Currency | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Currency | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!success) {
      return;
    }
    const timer = window.setTimeout(() => setSuccess(null), 2500);
    return () => window.clearTimeout(timer);
  }, [success]);

  async function handleAddCurrency(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!sessionId || isAdding) {
      return;
    }
    setIsAdding(true);
    setError(null);
    try {
      const result = await window.api.currencies.create({
        sessionId,
        code,
        name: name.trim() || undefined,
        symbol: symbol.trim().length > 0 ? symbol : undefined,
      });
      if (!result.ok) {
        setError(mapError(result.errorCode, result.message));
        return;
      }
      setCode('');
      setName('');
      setSymbol('');
      setSuccess(t('currencyAdded'));
      await onReload();
    } finally {
      setIsAdding(false);
    }
  }

  async function confirmDeactivate(): Promise<void> {
    if (!sessionId || !pendingDeactivate) {
      return;
    }
    setIsBusy(true);
    const result = await window.api.currencies.deactivate({ sessionId, code: pendingDeactivate.code });
    setIsBusy(false);
    if (!result.ok) {
      setError(mapError(result.errorCode, result.message));
      return;
    }
    setPendingDeactivate(null);
    setSuccess(t('currencyDeactivated'));
    await onReload();
  }

  async function confirmDelete(): Promise<void> {
    if (!sessionId || !pendingDelete) {
      return;
    }
    setIsBusy(true);
    const result = await window.api.currencies.delete({ sessionId, code: pendingDelete.code });
    setIsBusy(false);
    if (!result.ok) {
      setError(mapError(result.errorCode, result.message));
      return;
    }
    setPendingDelete(null);
    setSuccess(t('currencyDeleted'));
    await onReload();
  }

  async function handleReactivate(currency: Currency): Promise<void> {
    if (!sessionId) {
      return;
    }
    setIsBusy(true);
    const result = await window.api.currencies.reactivate({ sessionId, code: currency.code });
    setIsBusy(false);
    if (!result.ok) {
      setError(mapError(result.errorCode, result.message));
      return;
    }
    setSuccess(t('currencyReactivated'));
    await onReload();
  }

  return (
    <section className="card settings-section-card">
      <h2>{t('currencies')}</h2>
      <p className="hint-text">{t('currenciesHint')}</p>
      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="banner banner-success" role="status">
          {success}
        </div>
      ) : null}
      <div className="table-wrap">
        <table className="customer-table">
          <thead>
            <tr>
              <th>{t('currencyCode')}</th>
              <th>{t('currencyName')}</th>
              <th>{t('currencySymbol')}</th>
              <th>{t('currencyStatus')}</th>
              <th className="col-actions">{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {currencies.map((currency) => (
              <tr key={currency.code}>
                <td data-label={t('currencyCode')}>{currency.code}</td>
                <td data-label={t('currencyName')}>
                  {tCommon(currency.nameKey, { defaultValue: currency.displayName || currency.code })}
                </td>
                <td data-label={t('currencySymbol')}>{currency.symbol || tCommon('emptyValue')}</td>
                <td data-label={t('currencyStatus')}>{currency.isActive ? t('active') : t('inactive')}</td>
                <td className="col-actions" data-label={t('actions')}>
                  {currency.isActive ? (
                    <button
                      type="button"
                      className="button button-danger button-compact"
                      onClick={() => setPendingDeactivate(currency)}
                    >
                      {t('deactivateCurrency')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="button button-secondary button-compact"
                      disabled={isBusy}
                      onClick={() => void handleReactivate(currency)}
                    >
                      {t('reactivateCurrency')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="button button-danger button-compact"
                    onClick={() => setPendingDelete(currency)}
                  >
                    {t('deleteCurrency')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="currency-add-form" onSubmit={(event) => void handleAddCurrency(event)} autoComplete="off">
        <h3>{t('addCurrency')}</h3>
        <div className="action-bar currency-add-grid">
          <div className="form-field">
            <label htmlFor="new-currency-name">{t('currencyName')}</label>
            <input
              id="new-currency-name"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              disabled={isAdding}
              placeholder={t('currencyNamePlaceholder')}
            />
          </div>
          <div className="form-field">
            <label htmlFor="new-currency-code">{t('currencyCode')}</label>
            <input
              id="new-currency-code"
              value={code}
              maxLength={5}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              disabled={isAdding}
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="new-currency-symbol">
              {t('currencySymbol')} <span className="optional-label">({t('optional')})</span>
            </label>
            <input
              id="new-currency-symbol"
              value={symbol}
              maxLength={8}
              onChange={(event) => setSymbol(event.target.value)}
              disabled={isAdding}
            />
          </div>
          <button type="submit" className="button button-primary" disabled={isAdding}>
            {t('addCurrency')}
          </button>
        </div>
      </form>

      {pendingDeactivate ? (
        <ConfirmDialog
          title={t('deactivateTitle')}
          message={t('deactivateConfirm', { code: pendingDeactivate.code })}
          confirmLabel={t('deactivateCurrency')}
          isBusy={isBusy}
          onCancel={() => setPendingDeactivate(null)}
          onConfirm={() => void confirmDeactivate()}
        />
      ) : null}
      {pendingDelete ? (
        <ConfirmDialog
          title={t('deleteTitle')}
          message={
            pendingDelete.hasTransactions
              ? t('deleteBlocked', { code: pendingDelete.code })
              : t('deleteConfirm', { code: pendingDelete.code })
          }
          confirmLabel={pendingDelete.hasTransactions ? t('deactivateCurrency') : t('deleteCurrency')}
          isBusy={isBusy}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            if (pendingDelete.hasTransactions) {
              setPendingDelete(null);
              setPendingDeactivate(pendingDelete);
              return;
            }
            void confirmDelete();
          }}
        />
      ) : null}
    </section>
  );
}
