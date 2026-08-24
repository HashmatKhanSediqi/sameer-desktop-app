import type { Currency } from '@shared/types/currency';
import { useTranslation } from 'react-i18next';

interface TellerCurrencySelectProps {
  currencies: Currency[];
  value: string;
  onChange: (code: string) => void;
  id?: string;
  disabled?: boolean;
}

export function currencyLabel(currency: Currency, translate: (key: string, options?: { defaultValue: string }) => string): string {
  const name = translate(currency.nameKey, { defaultValue: currency.displayName || currency.code });
  return name === currency.code ? currency.code : `${currency.code} · ${name}`;
}

export function TellerCurrencySelect({
  currencies,
  value,
  onChange,
  id,
  disabled = false,
}: TellerCurrencySelectProps): JSX.Element {
  const { t } = useTranslation('common');

  return (
    <select
      id={id}
      className="teller-currency-select"
      value={value}
      disabled={disabled || currencies.length === 0}
      onChange={(event) => onChange(event.target.value)}
    >
      {currencies.map((currency) => (
        <option key={currency.code} value={currency.code}>
          {currencyLabel(currency, t)}
        </option>
      ))}
    </select>
  );
}
