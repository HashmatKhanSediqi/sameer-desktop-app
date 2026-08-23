import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sanitizeAmountInput } from '@shared/amountInput';
import type { Currency } from '@shared/types/currency';
import type { CustomerListItem } from '@shared/types/customer';
import { useAuth } from '../../../context/AuthContext';

interface TransferFormProps {
  customers: CustomerListItem[];
  currencies: Currency[];
  defaultFromCustomerId?: number;
  onCancel: () => void;
  onSaved: () => void;
}

export function TransferForm({
  customers,
  currencies,
  defaultFromCustomerId,
  onCancel,
  onSaved,
}: TransferFormProps): JSX.Element {
  const { t } = useTranslation('transactions');
  const { t: tErrors } = useTranslation('errors');
  const { sessionId } = useAuth();
  const [fromCustomerId, setFromCustomerId] = useState(defaultFromCustomerId ?? customers[0]?.id ?? 0);
  const [toCustomerId, setToCustomerId] = useState(
    customers.find((customer) => customer.id !== (defaultFromCustomerId ?? customers[0]?.id))?.id ?? 0,
  );
  const [currencyCode, setCurrencyCode] = useState(currencies[0]?.code ?? 'AFN');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !isSubmitting) {
        onCancel();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSubmitting, onCancel]);

  const fromName = customers.find((customer) => customer.id === fromCustomerId);
  const toName = customers.find((customer) => customer.id === toCustomerId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!sessionId || isSubmitting) {
      return;
    }
    if (!confirmed) {
      setConfirmed(true);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const result = await window.api.transactions.transfer({
        sessionId,
        fromCustomerId,
        toCustomerId,
        currencyCode,
        amount,
        note,
      });
      if (!result.ok) {
        setError(t(`validation.${result.message}`, { defaultValue: tErrors(result.errorCode) }));
        setConfirmed(false);
        return;
      }
      onSaved();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <form
        className="modal-dialog"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => void handleSubmit(event)}
        autoComplete="off"
      >
        <h2>{t('transfer.title')}</h2>
        <div className="form-field">
          <label htmlFor="transfer-from">{t('transfer.from')}</label>
          <select
            id="transfer-from"
            value={fromCustomerId}
            onChange={(event) => setFromCustomerId(Number(event.target.value))}
          >
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name?.trim() || customer.customerNumber || customer.id}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="transfer-to">{t('transfer.to')}</label>
          <select id="transfer-to" value={toCustomerId} onChange={(event) => setToCustomerId(Number(event.target.value))}>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name?.trim() || customer.customerNumber || customer.id}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="transfer-currency">{t('currency')}</label>
          <select id="transfer-currency" value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)}>
            {currencies.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="transfer-amount">{t('amount')}</label>
          <input
            id="transfer-amount"
            value={amount}
            onChange={(event) => setAmount(sanitizeAmountInput(event.target.value))}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="transfer-note">{t('note')}</label>
          <textarea id="transfer-note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
        </div>
        {confirmed ? (
          <p className="field-hint">
            {t('transfer.confirmSummary', {
              from: fromName?.name || fromCustomerId,
              to: toName?.name || toCustomerId,
              amount,
              currency: currencyCode,
            })}
          </p>
        ) : null}
        {error ? (
          <div className="banner banner-error" role="alert">
            {error}
          </div>
        ) : null}
        <div className="modal-actions">
          <button type="button" className="button button-secondary" onClick={onCancel} disabled={isSubmitting}>
            {t('cancel')}
          </button>
          <button type="submit" className="button button-primary" disabled={isSubmitting}>
            {confirmed ? t('transfer.confirm') : t('transfer.review')}
          </button>
        </div>
      </form>
    </div>
  );
}
