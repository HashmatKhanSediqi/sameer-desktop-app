import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TellerDenomination, TellerSession, TellerSessionSummary } from '@shared/types/teller';
import { useLocaleFormat } from '../../../hooks/useLocaleFormat';
import { formatTellerMoney, formatTellerPieces, formatTellerPlainAmount } from '../tellerDisplay';

interface TellerSummaryPanelProps {
  currencyCode: string;
  denominations: TellerDenomination[];
  session: TellerSession;
  summary: TellerSessionSummary;
  disabled: boolean;
  onSaveMeta: (input: { oppAmount?: string }) => void;
}

export function TellerSummaryPanel({
  currencyCode,
  denominations,
  session,
  summary,
  disabled,
  onSaveMeta,
}: TellerSummaryPanelProps): JSX.Element {
  const { t } = useTranslation('teller');
  const { formatMoney } = useLocaleFormat();
  const [oppAmount, setOppAmount] = useState(formatTellerPlainAmount(session.oppAmount));

  useEffect(() => {
    setOppAmount(formatTellerPlainAmount(session.oppAmount));
  }, [session]);

  const banner =
    currencyCode === 'AFN'
      ? t('sheet.bannerAfn')
      : currencyCode === 'USD'
        ? t('sheet.bannerUsd')
        : t('sheet.bannerOther', { currency: currencyCode });

  return (
    <section className="teller-workbook-summary">
      <header className="teller-workbook-banner">
        <h2>{banner}</h2>
      </header>
      <div className="teller-summary-layout">
        <table className="teller-summary-table">
          <thead>
            <tr>
              <th>{t('sheet.denominations')}</th>
              {denominations.map((denom) => (
                <th key={denom.id}>{denom.value}</th>
              ))}
              <th>{t('sheet.total')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>{t('sheet.cashReceived')}</th>
              {denominations.map((denom) => (
                <td key={denom.id} className="teller-cell-calc">
                  {formatTellerPieces(summary.totalReceivedByDenomination[denom.value] ?? 0)}
                </td>
              ))}
              <td className="teller-cell-calc">{formatTellerMoney(formatMoney, summary.grandTotalReceivedAmount)}</td>
            </tr>
            <tr>
              <th>{t('sheet.cashPaid')}</th>
              {denominations.map((denom) => (
                <td key={denom.id} className="teller-cell-calc">
                  {formatTellerPieces(summary.totalPaidByDenomination[denom.value] ?? 0)}
                </td>
              ))}
              <td className="teller-cell-calc">{formatTellerMoney(formatMoney, summary.grandTotalPaidAmount)}</td>
            </tr>
            <tr>
              <th>{t('sheet.totalAmount')}</th>
              {denominations.map((denom) => (
                <td key={denom.id} className="teller-cell-calc">
                  {formatTellerMoney(formatMoney, summary.totalAmountByDenomination[denom.value] ?? '0')}
                </td>
              ))}
              <td className="teller-cell-calc">{formatTellerMoney(formatMoney, summary.grandTotalAmount)}</td>
            </tr>
            <tr>
              <th>{t('sheet.totalPieces')}</th>
              {denominations.map((denom) => {
                const pieces = summary.netPiecesByDenomination[denom.value] ?? 0;
                return (
                  <td key={denom.id} className={pieces < 0 ? 'teller-cell-calc is-no' : 'teller-cell-calc'}>
                    {formatTellerPieces(pieces)}
                  </td>
                );
              })}
              <td className="teller-cell-calc" />
            </tr>
          </tbody>
        </table>
        <table className="teller-header-counts">
          <tbody>
            <tr>
              <th>{t('sheet.depositCount')}</th>
              <td>{summary.depositTransactionCount}</td>
            </tr>
            <tr>
              <th>{t('sheet.withdrawalCount')}</th>
              <td>{summary.withdrawalTransactionCount}</td>
            </tr>
            <tr>
              <th>{t('sheet.totalCount')}</th>
              <td>{summary.totalTransactionCount}</td>
            </tr>
            <tr>
              <th>{t('sheet.oppAmount')}</th>
              <td>
                <input
                  className="teller-input-amount"
                  inputMode="decimal"
                  value={oppAmount}
                  disabled={disabled}
                  onChange={(event) => setOppAmount(event.target.value)}
                  onBlur={() => onSaveMeta({ oppAmount: oppAmount.trim() || '0' })}
                />
              </td>
            </tr>
            <tr>
              <th>{t('sheet.headerTotal')}</th>
              <td className="teller-cell-calc">{formatTellerMoney(formatMoney, summary.headerTotal)}</td>
            </tr>
            <tr>
              <th>{t('sheet.result')}</th>
              <td className="teller-result">{formatTellerMoney(formatMoney, summary.result)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

