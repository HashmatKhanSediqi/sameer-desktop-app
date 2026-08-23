import { getMoneySign } from '@shared/money';
import { useLocaleFormat } from '../hooks/useLocaleFormat';

interface BalanceAmountProps {
  amount: string;
  suffix?: string;
}

export function BalanceAmount({ amount, suffix }: BalanceAmountProps): JSX.Element {
  const { formatMoney } = useLocaleFormat();
  const sign = getMoneySign(amount);

  return (
    <span className={`balance-value balance-${sign}`}>
      <span className="money" dir="ltr">
        {formatMoney(amount)}
        {suffix ? ` ${suffix}` : ''}
      </span>
    </span>
  );
}
