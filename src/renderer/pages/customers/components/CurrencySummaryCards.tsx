import { useTranslation } from 'react-i18next';
import type { CurrencySummary } from '@shared/types/transaction';
import { BalanceAmount } from '../../../components/BalanceAmount';
import { useLocaleFormat } from '../../../hooks/useLocaleFormat';
import { getSummaryTone } from '../../../theme/summaryTones';

interface CurrencySummaryCardsProps {
  summaries: CurrencySummary[];
}

export function CurrencySummaryCards({ summaries }: CurrencySummaryCardsProps): JSX.Element {
  const { t } = useTranslation('transactions');
  const { formatMoney } = useLocaleFormat();

  return (
    <div className="currency-summary-grid">
      {summaries.map((summary, index) => (
        <article
          key={summary.currencyCode}
          className="summary-card currency-card"
          data-tone={String(getSummaryTone(summary.currencyCode, index))}
          data-currency={summary.currencyCode}
        >
          <span className="summary-card-label">{t('balance')}</span>
          <span className="summary-card-currency">
            {summary.currencyCode}
            {summary.symbol ? ` ${summary.symbol}` : ''}
          </span>
          <strong className="summary-card-amount">
            <BalanceAmount amount={summary.balance} />
          </strong>
          <div className="currency-card-metrics">
            <p className="currency-metric amount-in">
              <span>{t('cashInTotal')}</span>
              <span>
                <span className="money" dir="ltr">{formatMoney(summary.cashInTotal)}</span>{' '}
                {t('count', { count: summary.cashInCount })}
              </span>
            </p>
            <p className="currency-metric amount-out">
              <span>{t('cashOutTotal')}</span>
              <span>
                <span className="money" dir="ltr">{formatMoney(summary.cashOutTotal)}</span>{' '}
                {t('count', { count: summary.cashOutCount })}
              </span>
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}
