import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CustomerListItem } from '@shared/types/customer';
import { normalizeLocale } from '@shared/types/locale';
import { isReportType, type ReportFormat, type ReportType } from '@shared/types/report';
import { useAuth } from '../../context/AuthContext';

interface ReportsPageProps {
  onBack: () => void;
  initialCustomerId?: number;
}

export function ReportsPage({ onBack, initialCustomerId }: ReportsPageProps): JSX.Element {
  const { t, i18n } = useTranslation('reports');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const { sessionId } = useAuth();
  const [type, setType] = useState<ReportType>(initialCustomerId ? 'customer' : 'all_customers');
  const [format, setFormat] = useState<ReportFormat>('pdf');
  const [customerId, setCustomerId] = useState<number | ''>(initialCustomerId ?? '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successPath, setSuccessPath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadCustomers = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.api.customers.list({ sessionId });
      if (!result.ok) {
        setError(tErrors(result.errorCode) || t('errors.loadCustomers'));
        return;
      }
      setCustomers(result.data.customers);
    } catch {
      setError(t('errors.loadCustomers'));
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, t, tErrors]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    const unsubscribe = window.api.reports.onProgress((payload) => {
      setProgress(payload.percent);
    });
    return unsubscribe;
  }, []);

  const showCustomer = type === 'customer' || type === 'date_range' || type === 'transactions';
  const customerRequired = type === 'customer';
  const showDates = type === 'customer' || type === 'date_range' || type === 'transactions';
  const datesRequired = type === 'date_range';

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!sessionId) {
      return;
    }

    if (customerRequired && customerId === '') {
      setError(t('errors.customerRequired'));
      return;
    }
    if (datesRequired && (!startDate || !endDate)) {
      setError(t('errors.dateRequired'));
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      setError(t('errors.invalidRange'));
      return;
    }

    setIsGenerating(true);
    setError(null);
    setSuccessPath(null);
    setProgress(0);

    try {
      const result = await window.api.reports.generate({
        sessionId,
        type,
        format,
        language: normalizeLocale(i18n.language),
        customerId: customerId === '' ? undefined : customerId,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });

      if (!result.ok) {
        setError(tErrors(result.errorCode) || result.message || tErrors('INTERNAL_ERROR'));
        return;
      }

      setSuccessPath(result.data.filePath);
    } catch {
      setError(tErrors('INTERNAL_ERROR'));
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  }

  async function copyPath(): Promise<void> {
    if (!successPath) {
      return;
    }
    await navigator.clipboard.writeText(successPath);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="reports-page">
      <div className="page-header">
        <h2>{t('title')}</h2>
        <button type="button" className="button button-secondary" onClick={onBack}>
          <span className="back-chevron">←</span> {tCommon('back')}
        </button>
      </div>

      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}

      {successPath ? (
        <div className="banner banner-success" role="status">
          <span>
            {t('success')}: <span className="mono">{successPath}</span>
          </span>
          <button type="button" className="button button-secondary button-compact" onClick={() => void copyPath()}>
            {copied ? t('copied') : t('copyPath')}
          </button>
        </div>
      ) : null}

      <form className="card report-form" onSubmit={(event) => void handleSubmit(event)}>
        <div className="form-field">
          <label htmlFor="report-type">{t('type.label')}</label>
          <select
            id="report-type"
            value={type}
            onChange={(event) => {
              const next = event.target.value;
              if (isReportType(next)) {
                setType(next);
              }
            }}
          >
            <option value="customer">{t('type.individual')}</option>
            <option value="all_customers">{t('type.allCustomers')}</option>
            <option value="date_range">{t('type.dateRange')}</option>
            <option value="transactions">{t('type.transaction')}</option>
            <option value="currency_summary">{t('type.currencySummary')}</option>
          </select>
        </div>

        {showCustomer ? (
          <div className="form-field">
            <label htmlFor="report-customer">{t('customer')}</label>
            <select
              id="report-customer"
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value === '' ? '' : Number(event.target.value))}
              disabled={isLoading}
              required={customerRequired}
            >
              <option value="">{customerRequired ? t('customerPlaceholder') : t('allCustomersOption')}</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name?.trim() ? customer.name : t('unnamedCustomer')}
                  {customer.customerNumber ? ` (${customer.customerNumber})` : ''}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {showDates ? (
          <div className="date-range-fields">
            <div className="form-field">
              <label htmlFor="report-from">{t('from')}</label>
              <input
                id="report-from"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                required={datesRequired}
              />
            </div>
            <div className="form-field">
              <label htmlFor="report-to">{t('to')}</label>
              <input
                id="report-to"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                required={datesRequired}
              />
            </div>
          </div>
        ) : null}

        <fieldset className="form-field">
          <legend>{t('format')}</legend>
          <div className="type-toggle">
            <label className={`type-option ${format === 'pdf' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="report-format"
                value="pdf"
                checked={format === 'pdf'}
                onChange={() => setFormat('pdf')}
              />
              {t('formatPdf')}
            </label>
            <label className={`type-option ${format === 'xlsx' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="report-format"
                value="xlsx"
                checked={format === 'xlsx'}
                onChange={() => setFormat('xlsx')}
              />
              {t('formatExcel')}
            </label>
          </div>
        </fieldset>

        {isGenerating ? (
          <p>
            {t('generating')}
            {progress !== null ? ` ${progress}%` : ''}
          </p>
        ) : null}

        <div className="action-bar">
          <button type="submit" className="button button-primary" disabled={isGenerating || isLoading}>
            {t('generate')}
          </button>
        </div>
      </form>
    </section>
  );
}
