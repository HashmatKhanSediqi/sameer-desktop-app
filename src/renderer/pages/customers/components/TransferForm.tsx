import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sanitizeAmountInput } from '@shared/amountInput';
import { combineDateAndTime } from '@shared/transactionDateTime';
import type { Currency } from '@shared/types/currency';
import type { CustomerIdentity } from '@shared/types/customer';
import { TransactionDateTimeFields } from '../../../components/TransactionDateTimeFields';
import { useAuth } from '../../../context/AuthContext';

interface TransferFormProps {
  currencies: Currency[];
  defaultFromCustomerId?: number;
  onCancel: () => void;
  onSaved: () => void;
}

const PICKER_PAGE_SIZE = 100;

export function TransferForm({
  currencies,
  defaultFromCustomerId,
  onCancel,
  onSaved,
}: TransferFormProps): JSX.Element {
  const { t } = useTranslation('transactions');
  const { t: tCustomers } = useTranslation('customers');
  const { t: tErrors } = useTranslation('errors');
  const { sessionId } = useAuth();
  const [customers, setCustomers] = useState<CustomerIdentity[]>([]);
  const [pickerQuery, setPickerQuery] = useState('');
  const [debouncedPickerQuery, setDebouncedPickerQuery] = useState('');
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [fromCustomerId, setFromCustomerId] = useState(defaultFromCustomerId ?? 0);
  const [toCustomerId, setToCustomerId] = useState(0);
  const [currencyCode, setCurrencyCode] = useState(currencies[0]?.code ?? 'AFN');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [dateValue, setDateValue] = useState('');
  const [timeValue, setTimeValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedPickerQuery(pickerQuery), 300);
    return () => window.clearTimeout(timer);
  }, [pickerQuery]);

  const loadCustomers = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      return;
    }

    setIsLoadingCustomers(true);
    try {
      const request = {
        sessionId,
        page: 1,
        pageSize: PICKER_PAGE_SIZE,
        includeAccounting: false as const,
      };
      const result =
        debouncedPickerQuery.trim().length === 0
          ? await window.api.customers.list(request)
          : await window.api.customers.search({ ...request, query: debouncedPickerQuery });
      if (!result.ok) {
        setError(tErrors(result.errorCode));
        return;
      }

      setCustomers(result.data.customers);
      const ids = result.data.customers.map((customer) => customer.id);
      const preferredFrom = defaultFromCustomerId && ids.includes(defaultFromCustomerId)
        ? defaultFromCustomerId
        : ids[0] ?? 0;
      setFromCustomerId((current) => (ids.includes(current) ? current : preferredFrom));
      setToCustomerId((current) => {
        if (ids.includes(current) && current !== preferredFrom) {
          return current;
        }
        return ids.find((id) => id !== preferredFrom) ?? 0;
      });
    } finally {
      setIsLoadingCustomers(false);
    }
  }, [debouncedPickerQuery, defaultFromCustomerId, sessionId, tErrors]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

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
    if (!sessionId || isSubmitting || customers.length < 2) {
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
        transactionDate: combineDateAndTime(dateValue, timeValue),
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
          <label htmlFor="transfer-picker-search">{tCustomers('list.searchPlaceholder')}</label>
          <input
            id="transfer-picker-search"
            type="search"
            className="search-input"
            value={pickerQuery}
            onChange={(event) => setPickerQuery(event.target.value)}
            placeholder={tCustomers('list.searchPlaceholder')}
          />
        </div>
        <div className="form-field">
          <label htmlFor="transfer-from">{t('transfer.from')}</label>
          <select
            id="transfer-from"
            value={fromCustomerId}
            disabled={isLoadingCustomers || customers.length === 0}
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
          <select
            id="transfer-to"
            value={toCustomerId}
            disabled={isLoadingCustomers || customers.length < 2}
            onChange={(event) => setToCustomerId(Number(event.target.value))}
          >
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
        <TransactionDateTimeFields
          dateId="transfer-date"
          timeId="transfer-time"
          dateLabel={t('date')}
          timeLabel={t('time')}
          optionalLabel={t('optional')}
          dateValue={dateValue}
          timeValue={timeValue}
          onDateChange={setDateValue}
          onTimeChange={setTimeValue}
          disabled={isSubmitting}
        />
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
          <button type="submit" className="button button-primary" disabled={isSubmitting || isLoadingCustomers || customers.length < 2}>
            {confirmed ? t('transfer.confirm') : t('transfer.review')}
          </button>
        </div>
      </form>
    </div>
  );
}
