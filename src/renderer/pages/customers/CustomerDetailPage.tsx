import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Customer } from '@shared/types/customer';
import type { Currency } from '@shared/types/currency';
import type { CustomerTransactionSummary, Transaction, TransactionType } from '@shared/types/transaction';
import { normalizeLocale } from '@shared/types/locale';
import { useAuth } from '../../context/AuthContext';
import { useLocaleFormat } from '../../hooks/useLocaleFormat';
import { ConfirmDialog } from './components/ConfirmDialog';
import { CustomerAvatar, invalidateCustomerPhotoCache } from './components/CustomerAvatar';
import { CustomerForm, mapCustomerError } from './components/CustomerForm';
import { CurrencySummaryCards } from './components/CurrencySummaryCards';
import { TransactionForm, mapTransactionError } from './components/TransactionForm';
import { TransactionTable } from './components/TransactionTable';
import { TransferForm } from './components/TransferForm';

interface CustomerDetailPageProps {
  customerId: number;
  onBack: () => void;
  onDeleted: () => void;
}

export function CustomerDetailPage({ customerId, onBack, onDeleted }: CustomerDetailPageProps): JSX.Element {
  const { t, i18n } = useTranslation('customers');
  const { t: tTx } = useTranslation('transactions');
  const { t: tCommon } = useTranslation('common');
  const { t: tReports } = useTranslation('reports');
  const { t: tErrors } = useTranslation('errors');
  const { sessionId } = useAuth();
  const { formatMoney, formatDate, formatDateTime } = useLocaleFormat();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [summary, setSummary] = useState<CustomerTransactionSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSucceeded, setDeleteSucceeded] = useState(false);
  const [transactionForm, setTransactionForm] = useState<'create' | 'edit' | null>(null);
  const [createType, setCreateType] = useState<TransactionType>('CASH_IN');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [pendingTransactionDelete, setPendingTransactionDelete] = useState<Transaction | null>(null);
  const [isDeletingTransaction, setIsDeletingTransaction] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [totalCustomerCount, setTotalCustomerCount] = useState(0);

  const load = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [customerResult, summaryResult, listResult, currencyResult, countResult] = await Promise.all([
        window.api.customers.get({ sessionId, id: customerId }),
        window.api.transactions.summary({ sessionId, customerId }),
        window.api.transactions.list({ sessionId, customerId, page }),
        window.api.currencies.list({ sessionId }),
        window.api.customers.list({ sessionId, page: 1, pageSize: 1, includeAccounting: false }),
      ]);

      if (!customerResult.ok) {
        setError(mapCustomerError((key) => String(t(key as never)), customerResult.errorCode, customerResult.message));
        setCustomer(null);
        return;
      }
      if (!summaryResult.ok) {
        setError(mapTransactionError((key) => String(tTx(key as never)), summaryResult.errorCode, summaryResult.message));
        return;
      }
      if (!listResult.ok) {
        setError(mapTransactionError((key) => String(tTx(key as never)), listResult.errorCode, listResult.message));
        return;
      }
      if (!currencyResult.ok) {
        setError(mapTransactionError((key) => String(tTx(key as never)), currencyResult.errorCode, currencyResult.message));
        return;
      }

      setCustomer(customerResult.data);
      setSummary(summaryResult.data);
      setTransactions(listResult.data.transactions);
      setTotalPages(listResult.data.totalPages);
      if (listResult.data.page !== page) {
        setPage(listResult.data.page);
      }
      setCurrencies(currencyResult.data.currencies);
      if (countResult.ok) {
        setTotalCustomerCount(countResult.data.totalCount);
      }
    } catch {
      setError(t('loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId, page, sessionId, t, tTx]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmDelete(): Promise<void> {
    if (!sessionId || isDeleting || deleteSucceeded) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    try {
      const result = await window.api.customers.delete({ sessionId, id: customerId });
      if (!result.ok) {
        setDeleteError(
          mapCustomerError((key) => String(t(key as never)), result.errorCode, result.message),
        );
        return;
      }
      invalidateCustomerPhotoCache(customerId);
      setDeleteSucceeded(true);
    } finally {
      setIsDeleting(false);
    }
  }

  function closeDeleteDialog(): void {
    if (deleteSucceeded) {
      onDeleted();
      return;
    }
    setPendingDelete(false);
    setDeleteError(null);
  }

  async function confirmDeleteTransaction(): Promise<void> {
    if (!sessionId || !pendingTransactionDelete) {
      return;
    }

    setIsDeletingTransaction(true);
    try {
      const result = await window.api.transactions.delete({
        sessionId,
        transactionId: pendingTransactionDelete.id,
      });
      if (!result.ok) {
        setError(mapTransactionError((key) => String(tTx(key as never)), result.errorCode, result.message));
        return;
      }
      setPendingTransactionDelete(null);
      await load();
    } finally {
      setIsDeletingTransaction(false);
    }
  }

  async function exportCustomerPdf(): Promise<void> {
    if (!sessionId || !customer || isExportingPdf) {
      return;
    }

    setIsExportingPdf(true);
    setExportMessage(null);
    setError(null);

    try {
      const result = await window.api.reports.generate({
        sessionId,
        type: 'customer',
        format: 'pdf',
        language: normalizeLocale(i18n.language),
        customerId: customer.id,
      });

      if (!result.ok) {
        setError(tErrors(result.errorCode) || result.message || tErrors('INTERNAL_ERROR'));
        return;
      }

      setExportMessage(t('exportPdfSuccess', { fileName: result.data.fileName }));
    } catch {
      setError(tErrors('INTERNAL_ERROR'));
    } finally {
      setIsExportingPdf(false);
    }
  }

  return (
    <section className="customer-page customer-page-detail">
      <div className="page-header">
        <button type="button" className="button button-secondary" onClick={onBack}>
          {t('back')}
        </button>
        {customer ? (
          <div className="header-actions">
            <button
              type="button"
              className="button button-cash-in"
              onClick={() => {
                setCreateType('CASH_IN');
                setTransactionForm('create');
              }}
            >
              <span className="tx-type-mark" aria-hidden="true">+</span>
              {tTx('cashIn')}
            </button>
            <button
              type="button"
              className="button button-cash-out"
              onClick={() => {
                setCreateType('CASH_OUT');
                setTransactionForm('create');
              }}
            >
              <span className="tx-type-mark" aria-hidden="true">−</span>
              {tTx('cashOut')}
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setShowTransfer(true)}
              disabled={totalCustomerCount < 2}
            >
              {tTx('transfer.title')}
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => void exportCustomerPdf()}
              disabled={isExportingPdf}
            >
              {isExportingPdf ? tReports('generating') : t('exportPdf')}
            </button>
            <button type="button" className="button button-secondary" onClick={() => setIsEditing(true)}>
              {t('edit')}
            </button>
            <button
              type="button"
              className="button button-danger"
              onClick={() => {
                setDeleteError(null);
                setDeleteSucceeded(false);
                setPendingDelete(true);
              }}
            >
              {t('delete')}
            </button>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="banner banner-error" role="alert">
          <span>{error}</span>
          <button type="button" className="button button-secondary button-compact" onClick={() => void load()}>
            {t('retry')}
          </button>
        </div>
      ) : null}

      {exportMessage ? (
        <div className="banner banner-success" role="status">
          {exportMessage}
        </div>
      ) : null}

      {isLoading ? <p>{t('list.loading')}</p> : null}

      {customer ? (
        <div className="customer-detail-layout">
          <aside className="card customer-detail customer-profile-card">
            <div className="customer-detail-header">
              <CustomerAvatar
                customerId={customer.id}
                name={customer.name}
                hasPhoto={customer.hasPhoto}
                size="lg"
              />
              <div>
                <p className="customer-profile-kicker">{t('detail')}</p>
                <h2>{customer.name?.trim() ? customer.name : t('noName')}</h2>
              </div>
            </div>

            <dl className="status-list">
              <div>
                <dt>{t('number')}</dt>
                <dd>{customer.customerNumber ?? tCommon('emptyValue')}</dd>
              </div>
              <div>
                <dt>{t('createdAt')}</dt>
                <dd>
                  <span className="money" dir="ltr">{formatDate(customer.createdAt)}</span>
                </dd>
              </div>
              <div>
                <dt>{t('updatedAt')}</dt>
                <dd>
                  <span className="money" dir="ltr">{formatDate(customer.updatedAt)}</span>
                </dd>
              </div>
            </dl>
          </aside>

          <div className="customer-detail-main">
            {summary ? (
              <div className="currency-summary-fixed currency-summary-scroll">
                <CurrencySummaryCards summaries={summary.currencies} />
              </div>
            ) : null}

            <div className="card customer-history-card">
              <h2 className="visually-hidden">{tTx('history')}</h2>
              <div className="history-scroll">
                {transactions.length === 0 ? (
                  <p className="subtitle">{tTx('empty')}</p>
                ) : (
                  <TransactionTable
                    transactions={transactions}
                    onEdit={(item) => {
                      setEditingTransaction(item);
                      setTransactionForm('edit');
                    }}
                    onDelete={setPendingTransactionDelete}
                  />
                )}
              </div>

              {totalPages > 1 ? (
                <div className="pagination-bar">
                  <button
                    type="button"
                    className="button button-secondary button-compact"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    {tTx('previous')}
                  </button>
                  <span>{tTx('page', { page, totalPages })}</span>
                  <button
                    type="button"
                    className="button button-secondary button-compact"
                    disabled={page >= totalPages}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    {tTx('next')}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {isEditing && customer ? (
        <CustomerForm
          mode="edit"
          customer={customer}
          onCancel={() => setIsEditing(false)}
          onSaved={(updated) => {
            setCustomer(updated);
            setIsEditing(false);
          }}
        />
      ) : null}

      {transactionForm === 'create' && customer && currencies.length > 0 ? (
        <TransactionForm
          mode="create"
          customerId={customerId}
          customerName={customer?.name?.trim() ? customer.name : t('noName')}
          currencies={currencies}
          initialType={createType}
          onCancel={() => setTransactionForm(null)}
          onSaved={() => {
            setTransactionForm(null);
            setPage(1);
            void load();
          }}
        />
      ) : null}

      {showTransfer && customer && currencies.length > 0 ? (
        <TransferForm
          currencies={currencies}
          defaultFromCustomerId={customer.id}
          onCancel={() => setShowTransfer(false)}
          onSaved={() => {
            setShowTransfer(false);
            setPage(1);
            void load();
          }}
        />
      ) : null}

      {transactionForm === 'edit' && customer && editingTransaction && currencies.length > 0 ? (
        <TransactionForm
          mode="edit"
          customerId={customerId}
          customerName={customer?.name?.trim() ? customer.name : t('noName')}
          currencies={currencies}
          transaction={editingTransaction}
          onCancel={() => {
            setTransactionForm(null);
            setEditingTransaction(null);
          }}
          onSaved={() => {
            setTransactionForm(null);
            setEditingTransaction(null);
            void load();
          }}
        />
      ) : null}

      {pendingDelete && customer ? (
        <ConfirmDialog
          title={t('deleteTitle')}
          message={t('deleteConfirm', { name: customer.name?.trim() ? customer.name : t('noName') })}
          isBusy={isDeleting}
          error={deleteError}
          successMessage={deleteSucceeded ? t('deletedSuccess') : null}
          onCancel={closeDeleteDialog}
          onConfirm={() => void confirmDelete()}
          onSuccessClose={onDeleted}
        />
      ) : null}

      {pendingTransactionDelete ? (
        <ConfirmDialog
          title={tTx('deleteTitle')}
          message={tTx('deleteConfirm', {
            type: pendingTransactionDelete.type === 'CASH_IN' ? tTx('cashIn') : tTx('cashOut'),
            amount: formatMoney(pendingTransactionDelete.amount),
            currency: pendingTransactionDelete.currencyCode,
            date: formatDateTime(pendingTransactionDelete.transactionDate),
          })}
          isBusy={isDeletingTransaction}
          onCancel={() => setPendingTransactionDelete(null)}
          onConfirm={() => void confirmDeleteTransaction()}
        />
      ) : null}
    </section>
  );
}
