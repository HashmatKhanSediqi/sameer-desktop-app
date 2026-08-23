import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  VALID_PREVIEW_LIMIT,
  type ImportCommitData,
  type ImportParseData,
  type ParsedCustomer,
  type ParsedTransaction,
} from '@shared/types/import';
import { useAuth } from '../../context/AuthContext';
import { ConfirmDialog } from '../customers/components/ConfirmDialog';

interface ImportPageProps {
  onBack: () => void;
  onImported: () => void;
}

type PreviewRow = {
  key: string;
  sheet: string;
  row: number;
  customer: string;
  number: string;
  type?: string;
  currency?: string;
  amount?: string;
  date?: string;
  note?: string;
};

export function ImportPage({ onBack, onImported }: ImportPageProps): JSX.Element {
  const { t } = useTranslation('import');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const { sessionId } = useAuth();
  const [isParsing, setIsParsing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templatePath, setTemplatePath] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportParseData | null>(null);
  const [summary, setSummary] = useState<ImportCommitData | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!templatePath) {
      return;
    }
    const timer = window.setTimeout(() => setTemplatePath(null), 4000);
    return () => window.clearTimeout(timer);
  }, [templatePath]);

  async function selectAndParse(): Promise<void> {
    if (!sessionId) {
      return;
    }

    setIsParsing(true);
    setError(null);
    setSummary(null);
    setPreview(null);

    try {
      const result = await window.api.import.parse({ sessionId });
      if (!result.ok) {
        setError(tErrors(result.errorCode) || result.message || tErrors('INTERNAL_ERROR'));
        return;
      }
      if (result.data.canceled) {
        return;
      }
      setPreview(result.data);
    } catch {
      setError(tErrors('INTERNAL_ERROR'));
    } finally {
      setIsParsing(false);
    }
  }

  async function downloadTemplate(): Promise<void> {
    if (!sessionId) {
      return;
    }
    setIsDownloading(true);
    setError(null);
    try {
      const result = await window.api.import.downloadTemplate({ sessionId });
      if (!result.ok) {
        setError(tErrors(result.errorCode) || result.message || tErrors('INTERNAL_ERROR'));
        return;
      }
      setTemplatePath(result.data.filePath);
    } catch {
      setError(tErrors('INTERNAL_ERROR'));
    } finally {
      setIsDownloading(false);
    }
  }

  async function commitImport(): Promise<void> {
    if (!sessionId || !preview) {
      return;
    }

    setIsCommitting(true);
    setError(null);
    setConfirmOpen(false);

    try {
      const result = await window.api.import.commit({
        sessionId,
        validCustomers: preview.validCustomers,
        validTransactions: preview.validTransactions,
      });
      if (!result.ok) {
        setError(tErrors(result.errorCode) || t('failure'));
        return;
      }
      setSummary(result.data);
    } catch {
      setError(t('failure'));
    } finally {
      setIsCommitting(false);
    }
  }

  const validCount = preview?.summary.validCount ?? 0;
  const canCommit = Boolean(preview) && validCount > 0 && !isCommitting && !summary;

  return (
    <section className="import-page">
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

      {templatePath ? (
        <div className="banner banner-success" role="status">
          {t('templateSaved')}: <span className="mono">{templatePath}</span>
        </div>
      ) : null}

      {summary ? (
        <div className="card import-summary-card">
          <h3>{t('successTitle')}</h3>
          <ul className="import-summary-list">
            <li>{t('summary.customersCreated', { count: summary.customersCreated })}</li>
            <li>{t('summary.customersMatched', { count: summary.customersMatched })}</li>
            <li>{t('summary.transactionsImported', { count: summary.transactionsImported })}</li>
            <li>{t('summary.rowsSkipped', { count: summary.rowsSkipped })}</li>
          </ul>
          <button type="button" className="button button-primary" onClick={onImported}>
            {t('backToList')}
          </button>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="action-bar">
              <button type="button" className="button button-primary" onClick={() => void selectAndParse()} disabled={isParsing}>
                {t('selectFile')}
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => void downloadTemplate()}
                disabled={isDownloading}
              >
                {t('downloadTemplate')}
              </button>
            </div>
            <p className="field-hint">
              {preview?.fileName ? `${t('fileLabel')}: ${preview.fileName}` : t('noFile')}
            </p>
            {isParsing ? <p>{t('parsing')}</p> : null}
            {isCommitting ? <p>{t('committing')}</p> : null}
          </div>

          {preview ? <ImportPreview preview={preview} /> : null}

          {preview ? (
            <div className="action-bar">
              <button type="button" className="button button-secondary" onClick={onBack} disabled={isCommitting}>
                {t('cancel')}
              </button>
              <button
                type="button"
                className="button button-primary"
                disabled={!canCommit}
                onClick={() => setConfirmOpen(true)}
              >
                {t('commitCount', { count: validCount })}
              </button>
            </div>
          ) : null}
        </>
      )}

      {confirmOpen && preview ? (
        <ConfirmDialog
          title={t('confirmTitle')}
          message={t('confirmMessage', {
            validCount,
            errorCount: preview.summary.errorCount,
          })}
          confirmLabel={t('commitCount', { count: validCount })}
          cancelLabel={t('cancel')}
          isBusy={isCommitting}
          tone="primary"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => void commitImport()}
        />
      ) : null}
    </section>
  );
}

function ImportPreview({ preview }: { preview: ImportParseData }): JSX.Element {
  const { t } = useTranslation('import');
  const { t: tTransactions } = useTranslation('transactions');
  const rows = buildPreviewRows(preview.validCustomers, preview.validTransactions).slice(0, VALID_PREVIEW_LIMIT);

  return (
    <div className="import-preview">
      <div className="import-stats">
        <span>{t('totalRows', { count: preview.summary.totalRows })}</span>
        <span className="stat-valid">{t('validRows', { count: preview.summary.validCount })}</span>
        <span className="stat-invalid">{t('invalidRows', { count: preview.summary.errorCount })}</span>
        <span>{t('warningsCount', { count: preview.summary.warningCount })}</span>
      </div>

      {preview.errors.length > 0 ? (
        <div className="card">
          <h3>{t('errorsTitle')}</h3>
          <ul className="import-issue-list">
            {preview.errors.map((issue) => (
              <li key={`error-${issue.sheet}-${issue.row}-${issue.column ?? ''}-${issue.code}`}>
                {issue.row > 0
                  ? t('rowError', { row: issue.row, message: issue.message })
                  : issue.message}
                {issue.column ? ` (${issue.column})` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {preview.warnings.length > 0 ? (
        <div className="card">
          <h3>{t('warningsTitle')}</h3>
          <ul className="import-issue-list">
            {preview.warnings.map((issue) => (
              <li key={`warn-${issue.sheet}-${issue.row}-${issue.column ?? ''}-${issue.code}`}>
                {issue.row > 0
                  ? t('rowError', { row: issue.row, message: issue.message })
                  : issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="table-wrap">
          <h3 className="import-table-title">{t('validPreviewTitle', { count: rows.length })}</h3>
          <table className="customer-table">
            <thead>
              <tr>
                <th>{t('previewTable.sheet')}</th>
                <th>{t('previewTable.row')}</th>
                <th>{t('previewTable.number')}</th>
                <th>{t('previewTable.customer')}</th>
                <th>{t('previewTable.type')}</th>
                <th>{t('previewTable.currency')}</th>
                <th>{t('previewTable.amount')}</th>
                <th>{t('previewTable.date')}</th>
                <th>{t('previewTable.note')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td data-label={t('previewTable.sheet')}>{row.sheet}</td>
                  <td data-label={t('previewTable.row')}>{row.row}</td>
                  <td data-label={t('previewTable.number')}>{row.number}</td>
                  <td data-label={t('previewTable.customer')}>{row.customer}</td>
                  <td data-label={t('previewTable.type')}>
                    {row.type ? (
                      <span className={row.type === 'CASH_IN' ? 'type-badge type-cash-in' : 'type-badge type-cash-out'}>
                        {row.type === 'CASH_IN' ? tTransactions('cashIn') : tTransactions('cashOut')}
                      </span>
                    ) : null}
                  </td>
                  <td data-label={t('previewTable.currency')}>{row.currency ?? ''}</td>
                  <td className="money" dir="ltr" data-label={t('previewTable.amount')}>
                    {row.amount ?? ''}
                  </td>
                  <td data-label={t('previewTable.date')}>{row.date ?? ''}</td>
                  <td className="note-cell" data-label={t('previewTable.note')}>{row.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function buildPreviewRows(
  customers: ParsedCustomer[],
  transactions: ParsedTransaction[],
): PreviewRow[] {
  const customerRows: PreviewRow[] = customers.map((customer) => ({
    key: `c-${customer.row}`,
    sheet: 'Customers',
    row: customer.row,
    customer: customer.name ?? '',
    number: customer.customerNumber ?? '',
  }));

  const transactionRows: PreviewRow[] = transactions.map((transaction) => ({
    key: `t-${transaction.row}`,
    sheet: 'Transactions',
    row: transaction.row,
    customer: transaction.customerName ?? '',
    number: transaction.customerNumber ?? '',
    type: transaction.type,
    currency: transaction.currencyCode,
    amount: transaction.amount,
    date: transaction.transactionDate.slice(0, 10),
    note: transaction.note ?? '',
  }));

  return [...customerRows, ...transactionRows];
}
