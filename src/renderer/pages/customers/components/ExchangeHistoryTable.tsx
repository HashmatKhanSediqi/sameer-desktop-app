import { useTranslation } from 'react-i18next';
import type { CustomerCurrencyExchange } from '@shared/types/transaction';
import { useLocaleFormat } from '../../../hooks/useLocaleFormat';

interface ExchangeHistoryTableProps {
  exchanges: CustomerCurrencyExchange[];
  onDelete: (exchange: CustomerCurrencyExchange) => void;
}

export function ExchangeHistoryTable({ exchanges, onDelete }: ExchangeHistoryTableProps): JSX.Element {
  const { t } = useTranslation('transactions');
  const { formatMoney, formatDateTime } = useLocaleFormat();

  return (
    <div className="table-wrap">
      <table className="customer-table exchange-history-table">
        <thead><tr>
          <th>{t('date')}</th><th>{t('exchange.fromCurrency')}</th><th>{t('exchange.fromAmount')}</th>
          <th>{t('exchange.toCurrency')}</th><th>{t('exchange.toAmount')}</th><th>{t('exchange.rate')}</th>
          <th>{t('exchange.commission')}</th><th>{t('note')}</th><th>{t('edit')}</th>
        </tr></thead>
        <tbody>{exchanges.map((exchange) => (
          <tr key={exchange.exchangeId}>
            <td><span className="money" dir="ltr">{formatDateTime(exchange.transactionDate)}</span></td>
            <td>{exchange.fromCurrency}</td>
            <td className="col-amount amount-out"><span className="money" dir="ltr">{formatMoney(exchange.fromAmount)}</span></td>
            <td>{exchange.toCurrency}</td>
            <td className="col-amount amount-in"><span className="money" dir="ltr">{formatMoney(exchange.toAmount)}</span></td>
            <td><span className="money" dir="ltr">{exchange.rate}</span></td>
            <td>{exchange.commissionAmount ? <span className="money" dir="ltr">{formatMoney(exchange.commissionAmount)} {exchange.commissionCurrency}</span> : '—'}</td>
            <td className="note-cell">{exchange.note || <span className="exchange-id">{t('exchange.id')}: {exchange.exchangeId}</span>}</td>
            <td><button type="button" className="button button-danger button-compact" onClick={() => onDelete(exchange)}>{t('delete')}</button></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
