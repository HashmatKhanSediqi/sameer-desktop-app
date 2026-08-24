import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppPaths, AppStatus } from '@shared/types/ipc';
import type { Currency } from '@shared/types/currency';
import type { AppSettings } from '@shared/types/settings';
import { PAGINATION_PAGE_SIZE_OPTIONS } from '@shared/types/settings';
import { LanguageSelector } from '../../components/LanguageSelector';
import { useAuth } from '../../context/AuthContext';
import { ConfirmDialog } from '../customers/components/ConfirmDialog';
import { RestorePage } from '../backup/RestorePage';
import type { BackupCreateData, BackupProgress } from '@shared/types/backup';
import {
  SettingsAccountSection,
  SettingsAppearanceSection,
  SettingsCompanySection,
  SettingsExchangeSection,
} from './SettingsPhase3Sections';
import { SettingsUpdateSection } from './SettingsUpdateSection';

interface SettingsPageProps {
  onBack: () => void;
}

export function SettingsPage({ onBack }: SettingsPageProps): JSX.Element {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const { t: tBackup } = useTranslation('backup');
  const { sessionId, username, clearLocalSession } = useAuth();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [paths, setPaths] = useState<AppPaths | null>(null);
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingPagination, setIsSavingPagination] = useState(false);
  const [code, setCode] = useState('');
  const [symbol, setSymbol] = useState('');
  const [isAddingCurrency, setIsAddingCurrency] = useState(false);
  const [pendingDeactivate, setPendingDeactivate] = useState<Currency | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [backupProgress, setBackupProgress] = useState<BackupProgress | null>(null);
  const [createdBackup, setCreatedBackup] = useState<BackupCreateData | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [settingsResult, currencyResult, pathsResult, statusResult] = await Promise.all([
        window.api.settings.get(),
        window.api.currencies.list({ sessionId, includeInactive: true }),
        window.api.app.getPaths(sessionId),
        window.api.app.getStatus(sessionId),
      ]);

      if (!settingsResult.ok) {
        setError(mapSettingsError(tErrors, settingsResult.errorCode, settingsResult.message));
        return;
      }
      if (!currencyResult.ok) {
        setError(mapSettingsError(tErrors, currencyResult.errorCode, currencyResult.message));
        return;
      }
      if (!pathsResult.ok) {
        setError(mapSettingsError(tErrors, pathsResult.errorCode, pathsResult.message));
        return;
      }
      if (!statusResult.ok) {
        setError(mapSettingsError(tErrors, statusResult.errorCode, statusResult.message));
        return;
      }

      setSettings(settingsResult.data);
      setCurrencies(currencyResult.data.currencies);
      setPaths(pathsResult.data);
      setStatus(statusResult.data);
    } catch {
      setError(tErrors('INTERNAL_ERROR'));
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, tErrors]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return window.api.backup.onProgress((next) => setBackupProgress(next));
  }, []);

  useEffect(() => {
    if (!createdBackup) {
      return;
    }
    const timer = window.setTimeout(() => setCreatedBackup(null), 8000);
    return () => window.clearTimeout(timer);
  }, [createdBackup]);

  useEffect(() => {
    return window.api.backup.onProgress((next) => setBackupProgress(next));
  }, []);

  useEffect(() => {
    if (!createdBackup) {
      return;
    }
    const timer = window.setTimeout(() => setCreatedBackup(null), 8000);
    return () => window.clearTimeout(timer);
  }, [createdBackup]);

  async function savePagination(next: { paginationEnabled?: boolean; paginationPageSize?: number }): Promise<void> {
    if (!sessionId || isSavingPagination) {
      return;
    }

    setIsSavingPagination(true);
    setError(null);
    try {
      const result = await window.api.settings.update({ sessionId, ...next });
      if (!result.ok) {
        setError(mapSettingsError(tErrors, result.errorCode, result.message));
        return;
      }
      setSettings(result.data);
      setSuccess(t('saved'));
    } finally {
      setIsSavingPagination(false);
    }
  }

  async function handleAddCurrency(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!sessionId || isAddingCurrency) {
      return;
    }

    setIsAddingCurrency(true);
    setError(null);
    try {
      const result = await window.api.currencies.create({
        sessionId,
        code,
        symbol: symbol.trim().length > 0 ? symbol : undefined,
      });
      if (!result.ok) {
        setError(mapSettingsError(tErrors, result.errorCode, result.message));
        return;
      }
      setCode('');
      setSymbol('');
      setSuccess(t('currencyAdded'));
      await load();
    } finally {
      setIsAddingCurrency(false);
    }
  }

  async function confirmDeactivate(): Promise<void> {
    if (!sessionId || !pendingDeactivate) {
      return;
    }

    setIsDeactivating(true);
    setError(null);
    try {
      const result = await window.api.currencies.deactivate({
        sessionId,
        code: pendingDeactivate.code,
      });
      if (!result.ok) {
        setError(mapSettingsError(tErrors, result.errorCode, result.message));
        return;
      }
      setPendingDeactivate(null);
      setSuccess(t('currencyDeactivated'));
      await load();
    } finally {
      setIsDeactivating(false);
    }
  }

  async function createBackup(): Promise<void> {
    if (!sessionId || isCreatingBackup) {
      return;
    }

    setIsCreatingBackup(true);
    setError(null);
    setCreatedBackup(null);
    try {
      const result = await window.api.backup.create({ sessionId });
      if (!result.ok) {
        setError(mapBackupError(tBackup, tErrors, result.errorCode, result.message));
        return;
      }
      if (result.data.canceled || !result.data.success) {
        return;
      }
      setCreatedBackup(result.data);
      setSuccess(tBackup('success'));
    } catch {
      setError(tErrors('INTERNAL_ERROR'));
    } finally {
      setIsCreatingBackup(false);
      setBackupProgress(null);
    }
  }

  async function copyDataDirectory(): Promise<void> {
    if (!paths) {
      return;
    }
    try {
      await navigator.clipboard.writeText(paths.userData);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(tErrors('INTERNAL_ERROR'));
    }
  }

  const pageSizeOptions = uniquePageSizes(settings?.paginationPageSize);

  if (showRestore) {
    return (
      <RestorePage
        variant="settings"
        onBack={() => setShowRestore(false)}
        onRestored={() => {
          clearLocalSession();
          window.location.reload();
        }}
      />
    );
  }

  return (
    <section className="customer-page settings-page">
      <div className="page-header">
        <button type="button" className="button button-secondary" onClick={onBack}>
          {tCommon('back')}
        </button>
        <h2>{t('title')}</h2>
      </div>

      {error ? (
        <div className="banner banner-error" role="alert">
          <span>{error}</span>
          <button type="button" className="button button-secondary button-compact" onClick={() => void load()}>
            {tCommon('retry')}
          </button>
        </div>
      ) : null}

      {success ? (
        <div className="banner banner-success" role="status">
          {success}
        </div>
      ) : null}

      {isLoading ? <p>{tCommon('loading')}</p> : null}

      <section className="card">
        <h2>{t('general')}</h2>
        <div className="form-field">
          <span className="field-label">{t('language')}</span>
          <LanguageSelector />
        </div>
      </section>

      <section className="card">
        <h2>{t('transactions')}</h2>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={settings?.paginationEnabled ?? true}
            disabled={!settings || isSavingPagination}
            onChange={(event) => void savePagination({ paginationEnabled: event.target.checked })}
          />
          {t('paginationEnabled')}
        </label>
        <div className="form-field">
          <label htmlFor="settings-page-size">{t('pageSize')}</label>
          <select
            id="settings-page-size"
            value={settings?.paginationPageSize ?? 10}
            disabled={!settings || !settings.paginationEnabled || isSavingPagination}
            onChange={(event) => void savePagination({ paginationPageSize: Number(event.target.value) })}
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="card">
        <h2>{t('currencies')}</h2>
        <div className="table-wrap">
          <table className="customer-table">
            <thead>
              <tr>
                <th>{t('currencyCode')}</th>
                <th>{t('currencyName')}</th>
                <th>{t('currencySymbol')}</th>
                <th>{t('currencyStatus')}</th>
                <th className="col-actions">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {currencies.map((currency) => (
                <tr key={currency.code}>
                  <td data-label={t('currencyCode')}>{currency.code}</td>
                  <td data-label={t('currencyName')}>{tCommon(currency.nameKey, { defaultValue: currency.code })}</td>
                  <td data-label={t('currencySymbol')}>{currency.symbol || tCommon('emptyValue')}</td>
                  <td data-label={t('currencyStatus')}>{currency.isActive ? t('active') : t('inactive')}</td>
                  <td className="col-actions" data-label={t('actions')}>
                    {currency.isActive ? (
                      <button
                        type="button"
                        className="button button-danger button-compact"
                        onClick={() => setPendingDeactivate(currency)}
                      >
                        {t('deactivateCurrency')}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form className="currency-add-form" onSubmit={(event) => void handleAddCurrency(event)} autoComplete="off">
          <h3>{t('addCurrency')}</h3>
          <div className="action-bar">
            <div className="form-field">
              <label htmlFor="new-currency-code">{t('currencyCode')}</label>
              <input
                id="new-currency-code"
                value={code}
                maxLength={5}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                disabled={isAddingCurrency}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="new-currency-symbol">
                {t('currencySymbol')} <span className="optional-label">({t('optional')})</span>
              </label>
              <input
                id="new-currency-symbol"
                value={symbol}
                maxLength={8}
                onChange={(event) => setSymbol(event.target.value)}
                disabled={isAddingCurrency}
              />
            </div>
            <button type="submit" className="button button-primary" disabled={isAddingCurrency}>
              {t('addCurrency')}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <h2>{t('account')}</h2>
        <dl className="status-list">
          <div>
            <dt>{t('username')}</dt>
            <dd>{username ?? tCommon('emptyValue')}</dd>
          </div>
        </dl>
      </section>

      <SettingsAccountSection
        onError={setError}
        onSuccess={setSuccess}
        onPasswordChanged={clearLocalSession}
      />

      <SettingsAppearanceSection
        settings={settings}
        onSaved={setSettings}
        onError={setError}
        onSuccess={setSuccess}
      />

      <SettingsCompanySection onError={setError} onSuccess={setSuccess} />

      <SettingsExchangeSection
        settings={settings}
        onSaved={setSettings}
        onError={setError}
        onSuccess={setSuccess}
      />

      <section className="card">
        <h2>{tBackup('title')}</h2>
        <div className="action-bar">
          <button
            type="button"
            className="button button-primary"
            onClick={() => void createBackup()}
            disabled={isCreatingBackup}
          >
            {isCreatingBackup ? tBackup('creating') : tBackup('create')}
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setShowRestore(true)}
            disabled={isCreatingBackup}
          >
            {tBackup('restoreFromBackup')}
          </button>
        </div>
        {backupProgress ? (
          <div className="backup-progress" role="status">
            <div
              className="backup-progress-bar"
              style={{ width: `${Math.max(0, Math.min(backupProgress.percent, 100))}%` }}
            />
            <p>{tBackup(`progress.${backupProgress.stage}`, { defaultValue: tBackup('creating') })}</p>
          </div>
        ) : null}
        {createdBackup ? (
          <dl className="status-list">
            <div>
              <dt>{tBackup('path')}</dt>
              <dd className="mono">{createdBackup.filePath}</dd>
            </div>
            <div>
              <dt>{tBackup('fileSize')}</dt>
              <dd>{formatFileSize(createdBackup.fileSizeBytes)}</dd>
            </div>
            <div>
              <dt>{tBackup('customerCount')}</dt>
              <dd>{createdBackup.manifest.customerCount}</dd>
            </div>
            <div>
              <dt>{tBackup('transactionCount')}</dt>
              <dd>{createdBackup.manifest.transactionCount}</dd>
            </div>
          </dl>
        ) : null}
      </section>

      <section className="card">
        <h2>{t('about')}</h2>
        <dl className="status-list">
          <div>
            <dt>{t('application')}</dt>
            <dd>{tCommon('appName')}</dd>
          </div>
          <div>
            <dt>{t('version')}</dt>
            <dd>{status?.version ?? tCommon('emptyValue')}</dd>
          </div>
          <div>
            <dt>{t('dataDirectory')}</dt>
            <dd className="mono">{paths?.userData ?? tCommon('emptyValue')}</dd>
          </div>
          <div>
            <dt>{t('databasePath')}</dt>
            <dd className="mono">{paths?.database ?? status?.databasePath ?? tCommon('emptyValue')}</dd>
          </div>
        </dl>
        <button type="button" className="button button-secondary" onClick={() => void copyDataDirectory()} disabled={!paths}>
          {copied ? t('copied') : t('copyPath')}
        </button>
        {sessionId ? <SettingsUpdateSection sessionId={sessionId} /> : null}
      </section>

      {pendingDeactivate ? (
        <ConfirmDialog
          title={t('deactivateTitle')}
          message={t('deactivateConfirm', { code: pendingDeactivate.code })}
          confirmLabel={t('deactivateCurrency')}
          isBusy={isDeactivating}
          onCancel={() => setPendingDeactivate(null)}
          onConfirm={() => void confirmDeactivate()}
        />
      ) : null}
    </section>
  );
}

function uniquePageSizes(current: number | undefined): number[] {
  const sizes = new Set<number>(PAGINATION_PAGE_SIZE_OPTIONS);
  if (typeof current === 'number') {
    sizes.add(current);
  }
  return [...sizes].sort((a, b) => a - b);
}

function mapBackupError(
  translateBackup: (key: string) => string,
  translateErrors: (key: string) => string,
  errorCode: string,
  message?: string,
): string {
  if (message) {
    const translated = translateBackup(message);
    if (translated !== message) {
      return translated;
    }
  }
  return mapSettingsError(translateErrors, errorCode, message);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mapSettingsError(
  translate: (key: string) => string,
  errorCode: string,
  message?: string,
): string {
  if (message) {
    const translated = translate(message);
    if (translated !== message) {
      return translated;
    }
  }
  const translated = translate(errorCode);
  return translated === errorCode ? translate('INTERNAL_ERROR') : translated;
}
