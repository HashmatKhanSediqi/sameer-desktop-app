import { FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { convertCurrency } from '@shared/exchange';
import { sanitizeAmountInput } from '@shared/amountInput';
import type { Currency } from '@shared/types/currency';
import { useLocaleFormat } from '../hooks/useLocaleFormat';

interface ExchangeCalculatorProps {
  currencies: Currency[];
}

export function ExchangeCalculator({ currencies }: ExchangeCalculatorProps): JSX.Element {
  const { t } = useTranslation('common');
  const { formatMoney } = useLocaleFormat();
  const [fromCurrency, setFromCurrency] = useState(currencies[0]?.code ?? 'USD');
  const [toCurrency, setToCurrency] = useState(currencies[1]?.code ?? 'AFN');
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const result = useMemo(() => {
    if (!amount || !rate) {
      return null;
    }
    try {
      return convertCurrency({ amount, rate, fromCurrency, toCurrency });
    } catch (caught) {
      return caught instanceof Error ? caught.message : 'EXCHANGE_AMOUNT_INVALID';
    }
  }, [amount, rate, fromCurrency, toCurrency]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (typeof result === 'string') {
      setError(t(`exchange.errors.${result}`, { defaultValue: t('exchange.invalid') }));
      return;
    }
    setError(null);
  }

  return (
    <section className="card exchange-card">
      <h2>{t('exchange.title')}</h2>
      <form className="exchange-form" onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="exchange-from">{t('exchange.from')}</label>
          <select id="exchange-from" value={fromCurrency} onChange={(event) => setFromCurrency(event.target.value)}>
            {currencies.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="exchange-to">{t('exchange.to')}</label>
          <select id="exchange-to" value={toCurrency} onChange={(event) => setToCurrency(event.target.value)}>
            {currencies.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="exchange-rate">{t('exchange.rate')}</label>
          <input
            id="exchange-rate"
            value={rate}
            onChange={(event) => setRate(sanitizeAmountInput(event.target.value))}
            inputMode="decimal"
          />
        </div>
        <div className="form-field">
          <label htmlFor="exchange-amount">{t('exchange.amount')}</label>
          <input
            id="exchange-amount"
            value={amount}
            onChange={(event) => setAmount(sanitizeAmountInput(event.target.value))}
            inputMode="decimal"
          />
        </div>
        <button type="submit" className="button button-secondary">
          {t('exchange.calculate')}
        </button>
      </form>
      {error ? (
        <p className="text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {result && typeof result !== 'string' ? (
        <p className="exchange-result" dir="ltr">
          {formatMoney(result.amount)} {result.fromCurrency} = {formatMoney(result.result)} {result.toCurrency}
        </p>
      ) : null}
    </section>
  );
}
