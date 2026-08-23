import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Transaction } from '@shared/types/transaction';
import { useLocaleFormat } from '../../../hooks/useLocaleFormat';

interface TransactionTableProps {
  transactions: Transaction[];
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}

export function TransactionTable({ transactions, onEdit, onDelete }: TransactionTableProps): JSX.Element {
  const { t } = useTranslation('transactions');
  const { t: tCommon } = useTranslation('common');
  const { formatMoney, formatDateTime } = useLocaleFormat();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <div className="table-wrap">
      <table className="customer-table transaction-table">
        <thead>
          <tr>
            <th>{t('date')}</th>
            <th>{t('type')}</th>
            <th>{t('currency')}</th>
            <th className="col-amount">{t('amount')}</th>
            <th>{t('note')}</th>
            <th className="col-actions">{t('edit')}</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => {
            const isExpanded = expandedId === transaction.id;
            const note = transaction.note ?? '';
            const truncated = note.length > 80 && !isExpanded;
            const isTransfer = Boolean(transaction.transferId);
            const typeLabel = isTransfer
              ? transaction.transferRole === 'IN'
                ? t('transfer.in')
                : t('transfer.out')
              : transaction.type === 'CASH_IN'
                ? t('cashIn')
                : t('cashOut');

            return (
              <tr key={transaction.id} className="transaction-row">
                <td data-label={t('date')}>
                  <span className="money" dir="ltr">{formatDateTime(transaction.transactionDate)}</span>
                  {transaction.isEdited ? <span className="edited-badge">{t('edited')}</span> : null}
                </td>
                <td data-label={t('type')}>
                  <span className={transaction.type === 'CASH_IN' ? 'type-badge type-cash-in' : 'type-badge type-cash-out'}>
                    {typeLabel}
                  </span>
                  {isTransfer && transaction.counterpartyName ? (
                    <p className="field-hint">
                      {t('transfer.with', { name: transaction.counterpartyName })}
                    </p>
                  ) : null}
                </td>
                <td data-label={t('currency')}>{transaction.currencyCode}</td>
                <td
                  className={transaction.type === 'CASH_IN' ? 'col-amount amount-in' : 'col-amount amount-out'}
                  data-label={t('amount')}
                >
                  <span className="money" dir="ltr">{formatMoney(transaction.amount)}</span>
                </td>
                <td className="note-cell" data-label={t('note')}>
                  {note ? (
                    <>
                      <span className={truncated ? 'note-truncated' : 'note-full'} title={note}>
                        {truncated ? `${note.slice(0, 80)}…` : note}
                      </span>
                      {note.length > 80 ? (
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => setExpandedId(isExpanded ? null : transaction.id)}
                        >
                          {isExpanded ? t('collapseNote') : t('expandNote')}
                        </button>
                      ) : null}
                    </>
                  ) : (
                    tCommon('emptyValue')
                  )}
                </td>
                <td className="col-actions" data-label={t('edit')}>
                  {!isTransfer ? (
                    <button type="button" className="button button-secondary button-compact" onClick={() => onEdit(transaction)}>
                      {t('edit')}
                    </button>
                  ) : null}
                  <button type="button" className="button button-danger button-compact" onClick={() => onDelete(transaction)}>
                    {t('delete')}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
