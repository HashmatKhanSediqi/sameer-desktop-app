import { amountsEqual, subtractTellerAmounts } from '@shared/teller/denominationMath';
import type { Currency } from '@shared/types/currency';
import type { TellerCurrencyDashboard, TellerSession } from '@shared/types/teller';
import { ZERO_BALANCE } from '@shared/money';
import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from '../../../hooks/useLocaleFormat';
import { TellerCurrencySelect } from './TellerCurrencySelect';

interface TellerSummaryBarProps {
  session: TellerSession | null;
  currencies: Currency[];
  currencyCode: string;
  summary: TellerCurrencyDashboard | null;
  onCurrencyChange: (code: string) => void;
  onCashIn: () => void;
  onCashOut: () => void;
  onCloseSession: () => void;
  closing: boolean;
}

export function TellerSummaryBar({
  session,
  currencies,
  currencyCode,
  summary,
  onCurrencyChange,
  onCashIn,
  onCashOut,
  onCloseSession,
  closing,
}: TellerSummaryBarProps): JSX.Element {
  const { t } = useTranslation('teller');
  const { formatMoney, formatDateTime } = useLocaleFormat();
  const balanced = summary ? amountsEqual(summary.difference, ZERO_BALANCE) : true;
  const last = summary?.lastTransaction;

  return (
    <section className="teller-summary" aria-label={t('dashboard.title')}>
      <div className="teller-summary-meta">
        <div>
          <span className="teller-summary-kicker">{t('session.title')}</span>
          {session ? (
            <p className="teller-summary-title">
              <span className="teller-pill is-ok">{t('session.statusOpen')}</span>
              <strong>{session.tellerUsername ?? t('session.title')}</strong>
              <span>
                {t('session.openedAt')} {formatDateTime(session.openedAt)}
              </span>
            </p>
          ) : (
            <p className="teller-summary-title">
              <span className="teller-pill is-warn">{t('session.none')}</span>
            </p>
          )}
        </div>
        <div className="teller-summary-tools">
          <label className="form-field teller-inline-field">
            <span>{t('dashboard.currentCurrency')}</span>
            <TellerCurrencySelect currencies={currencies} value={currencyCode} onChange={onCurrencyChange} />
          </label>
          {session ? (
            <button type="button" className="button button-secondary" onClick={onCloseSession} disabled={closing}>
              {t('session.close')}
            </button>
          ) : null}
        </div>
      </div>

      <dl className="teller-summary-metrics">
        <div>
          <dt>{t('dashboard.opening')}</dt>
          <dd>{formatMoney(summary?.openingBalance ?? ZERO_BALANCE)}</dd>
        </div>
        <div>
          <dt>{t('dashboard.cashIn')}</dt>
          <dd className="amount-in">{formatMoney(summary?.cashIn ?? ZERO_BALANCE)}</dd>
        </div>
        <div>
          <dt>{t('dashboard.cashOut')}</dt>
          <dd className="amount-out">{formatMoney(summary?.cashOut ?? ZERO_BALANCE)}</dd>
        </div>
        <div>
          <dt>{t('dashboard.currentBalance')}</dt>
          <dd>{formatMoney(summary?.currentBalance ?? ZERO_BALANCE)}</dd>
        </div>
        <div>
          <dt>{t('dashboard.physicalTally')}</dt>
          <dd>{formatMoney(summary?.physicalTally ?? ZERO_BALANCE)}</dd>
        </div>
        <div>
          <dt>{t('dashboard.difference')}</dt>
          <dd className={balanced ? 'amount-in' : 'amount-out'}>
            {formatMoney(summary?.difference ?? ZERO_BALANCE)}
          </dd>
        </div>
      </dl>

      <div className="teller-summary-footer">
        <div className="teller-summary-activity">
          <span className={balanced ? 'teller-pill is-ok' : 'teller-pill is-warn'}>
            {balanced ? t('dashboard.matched') : t('dashboard.unmatched')}
          </span>
          <span>
            {t('dashboard.transactionCount')}: {summary?.transactionCount ?? 0}
            {summary ? ` · ${t('dashboard.cashInCount')} ${summary.cashInCount} · ${t('dashboard.cashOutCount')} ${summary.cashOutCount}` : ''}
          </span>
          {summary && (summary.headTellerInCount > 0 || summary.headTellerOutCount > 0) ? (
            <span>
              {t('dashboard.headTellerIn')}: {summary.headTellerInCount} · {t('dashboard.headTellerOut')}:{' '}
              {summary.headTellerOutCount}
            </span>
          ) : null}
          <span>
            {t('dashboard.lastTransaction')}:{' '}
            {last
              ? `${last.transactionNumber} · ${formatMoney(last.amount)} · ${formatDateTime(last.transactionDate)}`
              : t('dashboard.noneLast')}
          </span>
          {!balanced && summary ? (
            <span className="amount-out">
              {t('dashboard.expected')}: {formatMoney(summary.expectedCash)} (
              {subtractTellerAmounts(summary.physicalTally, summary.expectedCash)})
            </span>
          ) : null}
        </div>
        <div className="teller-summary-actions">
          <button type="button" className="button button-cash-in" onClick={onCashIn} disabled={!session}>
            {t('nav.cashInAction')}
          </button>
          <button type="button" className="button button-cash-out" onClick={onCashOut} disabled={!session}>
            {t('nav.cashOutAction')}
          </button>
        </div>
      </div>
    </section>
  );
}
