import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Currency, CurrencyDenomination } from '@shared/types/currency';
import { useAuth } from '../../context/AuthContext';
import { ConfirmDialog } from '../customers/components/ConfirmDialog';
import { useLocaleFormat } from '../../hooks/useLocaleFormat';

interface CurrencyManagementSectionProps {
  currencies: Currency[];
  onReload: () => Promise<void>;
  onError: (message: string | null) => void;
  onSuccess: (message: string | null) => void;
  mapError: (errorCode: string, message?: string) => string;
}

export function CurrencyManagementSection({
  currencies,
  onReload,
  onError,
  onSuccess,
  mapError,
}: CurrencyManagementSectionProps): JSX.Element {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { sessionId } = useAuth();
  const { formatMoney } = useLocaleFormat();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [denomDraft, setDenomDraft] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [denoms, setDenoms] = useState<Record<string, CurrencyDenomination[]>>({});
  const [pendingDeactivate, setPendingDeactivate] = useState<Currency | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Currency | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!sessionId || !expanded) {
      return;
    }
    void window.api.currencies
      .listDenominations({ sessionId, currencyCode: expanded, includeInactive: true })
      .then((result) => {
        if (result.ok) {
          setDenoms((current) => ({ ...current, [expanded]: result.data.denominations }));
        }
      });
  }, [sessionId, expanded, currencies]);

  async function handleAddCurrency(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!sessionId || isAdding) {
      return;
    }
    setIsAdding(true);
    onError(null);
    try {
      const result = await window.api.currencies.create({
        sessionId,
        code,
        name: name.trim() || undefined,
        symbol: symbol.trim().length > 0 ? symbol : undefined,
      });
      if (!result.ok) {
        onError(mapError(result.errorCode, result.message));
        return;
      }
      const values = denomDraft
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      for (const value of values) {
        const denomResult = await window.api.currencies.createDenomination({
          sessionId,
          currencyCode: result.data.currency.code,
          value,
        });
        if (!denomResult.ok) {
          onError(mapError(denomResult.errorCode, denomResult.message));
          await onReload();
          return;
        }
      }
      setCode('');
      setName('');
      setSymbol('');
      setDenomDraft('');
      setExpanded(result.data.currency.code);
      onSuccess(t('currencyAdded'));
      await onReload();
    } finally {
      setIsAdding(false);
    }
  }

  async function addDenomination(currencyCode: string, value: string): Promise<void> {
    if (!sessionId || value.trim().length === 0) {
      return;
    }
    setIsBusy(true);
    onError(null);
    const result = await window.api.currencies.createDenomination({
      sessionId,
      currencyCode,
      value: value.trim(),
    });
    setIsBusy(false);
    if (!result.ok) {
      onError(mapError(result.errorCode, result.message));
      return;
    }
    onSuccess(t('denominationAdded'));
    await onReload();
  }

  async function toggleDenomination(item: CurrencyDenomination): Promise<void> {
    if (!sessionId) {
      return;
    }
    setIsBusy(true);
    const result = item.isActive
      ? await window.api.currencies.deactivateDenomination({ sessionId, id: item.id })
      : await window.api.currencies.reactivateDenomination({ sessionId, id: item.id });
    setIsBusy(false);
    if (!result.ok) {
      onError(mapError(result.errorCode, result.message));
      return;
    }
    await onReload();
  }

  async function deleteDenomination(item: CurrencyDenomination): Promise<void> {
    if (!sessionId) {
      return;
    }
    setIsBusy(true);
    const result = await window.api.currencies.deleteDenomination({ sessionId, id: item.id });
    setIsBusy(false);
    if (!result.ok) {
      onError(mapError(result.errorCode, result.message));
      return;
    }
    onSuccess(t('denominationDeleted'));
    await onReload();
  }

  async function confirmDeactivate(): Promise<void> {
    if (!sessionId || !pendingDeactivate) {
      return;
    }
    setIsBusy(true);
    const result = await window.api.currencies.deactivate({ sessionId, code: pendingDeactivate.code });
    setIsBusy(false);
    if (!result.ok) {
      onError(mapError(result.errorCode, result.message));
      return;
    }
    setPendingDeactivate(null);
    onSuccess(t('currencyDeactivated'));
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
      onError(mapError(result.errorCode, result.message));
      return;
    }
    setPendingDelete(null);
    onSuccess(t('currencyDeleted'));
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
      onError(mapError(result.errorCode, result.message));
      return;
    }
    onSuccess(t('currencyReactivated'));
    await onReload();
  }

  return (
    <section className="card">
      <h2>{t('currencies')}</h2>
      <p className="hint-text">{t('currenciesHint')}</p>
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
                  <button
                    type="button"
                    className="button button-secondary button-compact"
                    onClick={() => setExpanded(expanded === currency.code ? null : currency.code)}
                  >
                    {t('denominations')}
                  </button>
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

      {expanded ? (
        <DenominationEditor
          currencyCode={expanded}
          items={denoms[expanded] ?? []}
          disabled={isBusy}
          formatMoney={formatMoney}
          onAdd={(value) => void addDenomination(expanded, value)}
          onToggle={(item) => void toggleDenomination(item)}
          onDelete={(item) => void deleteDenomination(item)}
        />
      ) : null}

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
          <div className="form-field">
            <label htmlFor="new-currency-denoms">
              {t('denominations')} <span className="optional-label">({t('optional')})</span>
            </label>
            <input
              id="new-currency-denoms"
              value={denomDraft}
              onChange={(event) => setDenomDraft(event.target.value)}
              disabled={isAdding}
              placeholder={t('denominationPlaceholder')}
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

function DenominationEditor({
  currencyCode,
  items,
  disabled,
  formatMoney,
  onAdd,
  onToggle,
  onDelete,
}: {
  currencyCode: string;
  items: CurrencyDenomination[];
  disabled: boolean;
  formatMoney: (value: string) => string;
  onAdd: (value: string) => void;
  onToggle: (item: CurrencyDenomination) => void;
  onDelete: (item: CurrencyDenomination) => void;
}): JSX.Element {
  const { t } = useTranslation('settings');
  const [value, setValue] = useState('');

  return (
    <div className="teller-denom-editor">
      <h3>
        {t('denominations')} · {currencyCode}
      </h3>
      {items.length === 0 ? <p className="empty-state">{t('noDenominations')}</p> : null}
      <ul className="teller-denom-editor-list">
        {items.map((item) => (
          <li key={item.id}>
            <strong>{formatMoney(item.value)}</strong>
            <span>{item.isActive ? t('active') : t('inactive')}</span>
            <button type="button" className="button button-secondary button-compact" disabled={disabled} onClick={() => onToggle(item)}>
              {item.isActive ? t('deactivateCurrency') : t('reactivateCurrency')}
            </button>
            <button
              type="button"
              className="button button-danger button-compact"
              disabled={disabled || item.inUse}
              onClick={() => onDelete(item)}
              title={item.inUse ? t('denominationInUse') : undefined}
            >
              {t('deleteCurrency')}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="action-bar"
        onSubmit={(event) => {
          event.preventDefault();
          onAdd(value);
          setValue('');
        }}
      >
        <div className="form-field">
          <label htmlFor={`add-denom-${currencyCode}`}>{t('denominationValue')}</label>
          <input
            id={`add-denom-${currencyCode}`}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            disabled={disabled}
            placeholder="100"
          />
        </div>
        <button type="submit" className="button button-primary" disabled={disabled || value.trim().length === 0}>
          {t('addDenomination')}
        </button>
      </form>
    </div>
  );
}
