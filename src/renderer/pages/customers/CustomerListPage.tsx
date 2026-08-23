import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Currency } from '@shared/types/currency';
import type { Customer, CustomerListItem } from '@shared/types/customer';
import type { GlobalCurrencyTotal } from '@shared/types/transaction';
import { ExchangeCalculator } from '../../components/ExchangeCalculator';
import { useAuth } from '../../context/AuthContext';
import { TransferForm } from './components/TransferForm';
import { ConfirmDialog } from './components/ConfirmDialog';
import { invalidateCustomerPhotoCache } from './components/CustomerAvatar';
import { CustomerForm, mapCustomerError } from './components/CustomerForm';
import { CustomerTable } from './components/CustomerTable';
import { GlobalTotalCards } from './components/GlobalTotalCards';

interface CustomerListPageProps {
  onViewCustomer: (id: number) => void;
  onOpenReports: () => void;
  onOpenImport: () => void;
}

export function CustomerListPage({ onViewCustomer, onOpenReports, onOpenImport }: CustomerListPageProps): JSX.Element {
  const { t } = useTranslation('customers');
  const { t: tCommon } = useTranslation('common');
  const { t: tTx } = useTranslation('transactions');
  const { sessionId } = useAuth();
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [totals, setTotals] = useState<GlobalCurrencyTotal[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [exchangeEnabled, setExchangeEnabled] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CustomerListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const loadCustomers = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [result, currencyResult, settingsResult] = await Promise.all([
        debouncedQuery.trim().length === 0
          ? window.api.customers.list({ sessionId })
          : window.api.customers.search({ sessionId, query: debouncedQuery }),
        window.api.currencies.list({ sessionId }),
        window.api.settings.get(),
      ]);

      if (!result.ok) {
        setError(mapCustomerError((key) => String(t(key as never)), result.errorCode, result.message));
        return;
      }

      setCustomers(result.data.customers);
      setTotals(result.data.totals);
      if (currencyResult.ok) {
        setCurrencies(currencyResult.data.currencies);
      }
      if (settingsResult.ok) {
        setExchangeEnabled(settingsResult.data.exchangeEnabled);
      }
    } catch {
      setError(t('loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [debouncedQuery, sessionId, t]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    if (!success) {
      return;
    }
    const timer = window.setTimeout(() => setSuccess(null), 3000);
    return () => window.clearTimeout(timer);
  }, [success]);

  async function openEdit(id: number): Promise<void> {
    if (!sessionId) {
      return;
    }

    const result = await window.api.customers.get({ sessionId, id });
    if (!result.ok) {
      setError(mapCustomerError((key) => String(t(key as never)), result.errorCode, result.message));
      return;
    }

    setEditingCustomer(result.data);
    setFormMode('edit');
  }

  async function confirmDelete(): Promise<void> {
    if (!sessionId || !pendingDelete) {
      return;
    }

    setIsDeleting(true);
    try {
      const result = await window.api.customers.delete({ sessionId, id: pendingDelete.id });
      if (!result.ok) {
        setError(mapCustomerError((key) => String(t(key as never)), result.errorCode, result.message));
        return;
      }

      invalidateCustomerPhotoCache(pendingDelete.id);
      setPendingDelete(null);
      setSuccess(t('deleted'));
      await loadCustomers();
    } finally {
      setIsDeleting(false);
    }
  }

  function handleSaved(_customer: Customer): void {
    setFormMode(null);
    setEditingCustomer(null);
    setSuccess(t('saved'));
    void loadCustomers();
  }

  return (
    <section className="customer-page">
      <div className="page-header">
        <h2>{t('list.title')}</h2>
        <button type="button" className="button button-primary" onClick={() => setFormMode('create')}>
          {t('add')}
        </button>
      </div>

      <GlobalTotalCards totals={totals} />
      {exchangeEnabled ? <ExchangeCalculator currencies={currencies} /> : null}

      <div className="action-bar">
        <input
          type="search"
          className="search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('list.searchPlaceholder')}
          aria-label={t('list.searchPlaceholder')}
        />
        <button
          type="button"
          className="button button-secondary"
          onClick={() => setShowTransfer(true)}
          disabled={customers.length < 2}
        >
          {tTx('transfer.title')}
        </button>
        <button type="button" className="button button-secondary" onClick={onOpenImport}>
          {tCommon('import')}
        </button>
        <button type="button" className="button button-secondary" onClick={onOpenReports}>
          {tCommon('reports')}
        </button>
      </div>

      {error ? (
        <div className="banner banner-error" role="alert">
          <span>{error}</span>
          <button type="button" className="button button-secondary button-compact" onClick={() => void loadCustomers()}>
            {t('retry')}
          </button>
        </div>
      ) : null}

      {success ? (
        <div className="banner banner-success" role="status">
          {success}
        </div>
      ) : null}

      {isLoading ? (
        <p>{t('list.loading')}</p>
      ) : customers.length === 0 ? (
        <div className="empty-state">
          <p>{t('list.empty')}</p>
          <p className="subtitle">{t('list.emptyHint')}</p>
          <button type="button" className="button button-primary" onClick={() => setFormMode('create')}>
            {t('add')}
          </button>
        </div>
      ) : (
        <CustomerTable
          customers={customers}
          currencyCodes={totals.map((total) => total.currencyCode)}
          onView={onViewCustomer}
          onEdit={(id) => void openEdit(id)}
          onDelete={setPendingDelete}
        />
      )}

      {formMode === 'create' ? (
        <CustomerForm mode="create" onCancel={() => setFormMode(null)} onSaved={handleSaved} />
      ) : null}

      {formMode === 'edit' && editingCustomer ? (
        <CustomerForm
          mode="edit"
          customer={editingCustomer}
          onCancel={() => {
            setFormMode(null);
            setEditingCustomer(null);
          }}
          onSaved={handleSaved}
        />
      ) : null}

      {showTransfer ? (
        <TransferForm
          customers={customers}
          currencies={currencies}
          onCancel={() => setShowTransfer(false)}
          onSaved={() => {
            setShowTransfer(false);
            setSuccess(tTx('transfer.saved'));
            void loadCustomers();
          }}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title={t('deleteTitle')}
          message={t('deleteConfirm', { name: pendingDelete.name?.trim() ? pendingDelete.name : t('noName') })}
          isBusy={isDeleting}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </section>
  );
}
