import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isLatinAmountInsert, sanitizeAmountInput } from '@shared/amountInput';
import { combineDateAndTime, resolveCreateDateTime, splitDateAndTime } from '@shared/transactionDateTime';
import type { Currency } from '@shared/types/currency';
import type { Transaction, TransactionType } from '@shared/types/transaction';
import { TransactionDateTimeFields } from '../../../components/TransactionDateTimeFields';
import { useAuth } from '../../../context/AuthContext';

interface TransactionFormProps {
  mode: 'create' | 'edit';
  customerId: number;
  customerName?: string;
  currencies: Currency[];
  transaction?: Transaction;
  initialType?: TransactionType;
  onCancel: () => void;
  onSaved: (transaction: Transaction) => void;
}

export function TransactionForm({
  mode,
  customerId,
  customerName,
  currencies,
  transaction,
  initialType,
  onCancel,
  onSaved,
}: TransactionFormProps): JSX.Element {
  const { t } = useTranslation('transactions');
  const { t: tCommon } = useTranslation('common');
  const { sessionId } = useAuth();
  const type: TransactionType = transaction?.type ?? initialType ?? 'CASH_IN';
  const [amount, setAmount] = useState(() => sanitizeAmountInput(transaction?.amount ?? ''));
  const [currencyCode, setCurrencyCode] = useState(
    transaction?.currencyCode ?? currencies[0]?.code ?? 'AFN',
  );
  const [note, setNote] = useState(transaction?.note ?? '');
  const initialDateTime = splitDateAndTime(transaction?.transactionDate);
  const [dateValue, setDateValue] = useState(initialDateTime.date);
  const [timeValue, setTimeValue] = useState(initialDateTime.time);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !isSubmitting) {
        onCancel();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSubmitting, onCancel]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!sessionId || isSubmitting) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    let transactionDate: string | undefined;
    if (mode === 'create') {
      const resolved = resolveCreateDateTime(dateValue, timeValue);
      setDateValue(resolved.date);
      setTimeValue(resolved.time);
      transactionDate = resolved.combined;
    } else {
      transactionDate = combineDateAndTime(dateValue, timeValue) ?? transaction?.transactionDate;
    }

    try {
      const result =
        mode === 'create'
          ? await window.api.transactions.create({
              sessionId,
              customerId,
              type,
              amount,
              currencyCode,
              transactionDate,
              note,
            })
          : await window.api.transactions.update({
              sessionId,
              transactionId: transaction!.id,
              type,
              amount,
              currencyCode,
              transactionDate,
              note,
            });

      if (!result.ok) {
        setError(mapTransactionError((key) => String(t(key as never)), result.errorCode, result.message));
        return;
      }

      onSaved(result.data.transaction);
    } finally {
      setIsSubmitting(false);
    }
  }

  const selectedCurrency = currencies.find((currency) => currency.code === currencyCode);
  const currencyAffix = selectedCurrency?.symbol || currencyCode;
  const isCashIn = type === 'CASH_IN';
  const formClass = isCashIn
    ? 'transaction-form cash-in-accent'
    : 'transaction-form cash-out-accent';
  const typeLabel = isCashIn ? t('cashIn') : t('cashOut');

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal-dialog transaction-modal"
        data-type={type}
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-modal-title"
      >
        <header className="transaction-modal-header">
          <h2 id="transaction-modal-title">
            <span className="tx-type-mark" aria-hidden="true">{isCashIn ? '+' : '−'}</span>
            {mode === 'create' ? typeLabel : t('edit')}
          </h2>
          {customerName ? <p className="transaction-modal-subtitle">{t('forCustomer', { name: customerName })}</p> : null}
        </header>

        <form className={formClass} onSubmit={(event) => void handleSubmit(event)} autoComplete="off">
          <div className="transaction-modal-body">
            <fieldset className="form-field">
              <legend className="field-label">{t('type')}</legend>
              <div className="type-toggle" aria-label={t('type')}>
                <div
                  className={
                    isCashIn
                      ? 'type-option type-option-fixed type-cash-in selected'
                      : 'type-option type-option-fixed type-cash-out selected'
                  }
                  aria-current="true"
                >
                  {typeLabel}
                </div>
              </div>
            </fieldset>

            <div className="form-field amount-field">
              <label htmlFor="transaction-amount">{t('amount')}</label>
              <div className="amount-input-shell">
                <input
                  id="transaction-amount"
                  className="amount-input money"
                  type="text"
                  inputMode="decimal"
                  lang="en"
                  dir="ltr"
                  autoComplete="off"
                  value={amount}
                  onChange={(event) => setAmount(sanitizeAmountInput(event.target.value))}
                  onBeforeInput={(event) => {
                    if (typeof event.data === 'string' && event.data.length > 0 && !isLatinAmountInsert(event.data)) {
                      event.preventDefault();
                    }
                  }}
                  onPaste={(event) => {
                    event.preventDefault();
                    const input = event.currentTarget;
                    const pasted = sanitizeAmountInput(event.clipboardData?.getData('text') ?? '');
                    const start = input.selectionStart ?? amount.length;
                    const end = input.selectionEnd ?? amount.length;
                    setAmount(sanitizeAmountInput(`${amount.slice(0, start)}${pasted}${amount.slice(end)}`));
                  }}
                  disabled={isSubmitting}
                  required
                  autoFocus
                />
                <span className="amount-affix money" dir="ltr">
                  {currencyAffix}
                </span>
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="transaction-currency">{t('currency')}</label>
              <select
                id="transaction-currency"
                value={currencyCode}
                onChange={(event) => setCurrencyCode(event.target.value)}
                disabled={isSubmitting}
              >
                {currencies.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code}
                    {currency.symbol ? ` (${currency.symbol})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <TransactionDateTimeFields
              dateId="transaction-date"
              timeId="transaction-time"
              dateLabel={t('date')}
              timeLabel={t('time')}
              optionalLabel={mode === 'create' ? t('optional') : undefined}
              dateValue={dateValue}
              timeValue={timeValue}
              onDateChange={setDateValue}
              onTimeChange={setTimeValue}
              disabled={isSubmitting}
              required={mode === 'edit'}
            />

            <div className="form-field">
              <label htmlFor="transaction-note">
                {t('note')} <span className="optional-label">({t('optional')})</span>
              </label>
              <textarea
                id="transaction-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                disabled={isSubmitting}
                rows={5}
              />
            </div>

            {error ? (
              <div className="banner banner-error" role="alert">
                {error}
              </div>
            ) : null}
          </div>

          <div className="transaction-modal-footer">
            <button type="button" className="button button-secondary" onClick={onCancel} disabled={isSubmitting}>
              {t('cancel')}
            </button>
            <button
              type="submit"
              className={isCashIn ? 'button button-cash-in' : 'button button-cash-out'}
              disabled={isSubmitting}
            >
              {isSubmitting ? tCommon('loading') : mode === 'create' ? typeLabel : t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function mapTransactionError(
  translate: (key: string) => string,
  errorCode: string,
  message?: string,
): string {
  if (message) {
    const validationKey = `validation.${message}`;
    const translated = translate(validationKey);
    if (translated !== validationKey) {
      return translated;
    }
  }

  const errorKey = `errors.${errorCode}`;
  const translated = translate(errorKey);
  return translated === errorKey ? translate('errors.INTERNAL_ERROR') : translated;
}
