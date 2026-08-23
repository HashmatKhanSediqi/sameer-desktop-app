import { useTranslation } from 'react-i18next';
import type { GlobalCurrencyTotal } from '@shared/types/transaction';
import { BalanceAmount } from '../../../components/BalanceAmount';
import { getSummaryTone } from '../../../theme/summaryTones';

interface GlobalTotalCardsProps {
  totals: GlobalCurrencyTotal[];
}

export function GlobalTotalCards({ totals }: GlobalTotalCardsProps): JSX.Element | null {
  const { t } = useTranslation('common');

  if (totals.length === 0) {
    return null;
  }

  return (
    <div className="summary-card-grid">
      {totals.map((total, index) => (
        <article
          key={total.currencyCode}
          className="summary-card"
          data-tone={String(getSummaryTone(total.currencyCode, index))}
          data-currency={total.currencyCode}
        >
          <span className="summary-card-label">{t('totalCurrency', { code: total.currencyCode })}</span>
          <span className="summary-card-currency">{total.symbol || total.currencyCode}</span>
          <strong className="summary-card-amount">
            <BalanceAmount amount={total.balance} />
          </strong>
        </article>
      ))}
    </div>
  );
}
