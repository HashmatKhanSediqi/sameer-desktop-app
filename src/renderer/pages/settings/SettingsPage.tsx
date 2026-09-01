import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppPaths, AppStatus } from '@shared/types/ipc';
import type { Currency } from '@shared/types/currency';
import type { AppSettings } from '@shared/types/settings';
import { PAGINATION_PAGE_SIZE_OPTIONS } from '@shared/types/settings';
import { LanguageSelector } from '../../components/LanguageSelector';
import { useAuth } from '../../context/AuthContext';
import { RestorePage } from '../backup/RestorePage';
import type { BackupCreateData, BackupProgress, AutomaticBackupConfig } from '@shared/types/backup';
import {
  SettingsAccountSection,
  SettingsAppearanceSection,
  SettingsCompanySection,
  SettingsExchangeSection,
} from './SettingsPhase3Sections';
import { SettingsUpdateSection } from './SettingsUpdateSection';
import { CurrencyManagementSection } from './CurrencyManagementSection';

interface SettingsPageProps {
  onBack: () => void;
}

type SettingsSectionId =
  | 'general'
  | 'appearance'
  | 'account'
  | 'company'
  | 'transactions'
  | 'currencies'
  | 'exchange'
  | 'backup'
  | 'about';

const SETTINGS_SECTIONS: Array<{ id: SettingsSectionId; labelKey: string; namespace?: 'settings' | 'backup' }> = [
  { id: 'general', labelKey: 'general' },
  { id: 'appearance', labelKey: 'appearance' },
  { id: 'account', labelKey: 'accountSecurity' },
  { id: 'company', labelKey: 'companyProfile' },
  { id: 'transactions', labelKey: 'transactions' },
  { id: 'currencies', labelKey: 'currencies' },
  { id: 'exchange', labelKey: 'exchange' },
  { id: 'backup', labelKey: 'title', namespace: 'backup' },
  { id: 'about', labelKey: 'about' },
];

export function SettingsPage({ onBack }: SettingsPageProps): JSX.Element {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const { t: tBackup } = useTranslation('backup');
  const { sessionId, clearLocalSession } = useAuth();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [paths, setPaths] = useState<AppPaths | null>(null);
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingPagination, setIsSavingPagination] = useState(false);
  const [paginationError, setPaginationError] = useState<string | null>(null);
  const [paginationSuccess, setPaginationSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [showRestore, setShowRestore] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [backupProgress, setBackupProgress] = useState<BackupProgress | null>(null);
  const [createdBackup, setCreatedBackup] = useState<BackupCreateData | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  const [automaticBackup, setAutomaticBackup] = useState<AutomaticBackupConfig | null>(null);
  const [automaticBackupError, setAutomaticBackupError] = useState<string | null>(null);
  const [automaticBackupSuccess, setAutomaticBackupSuccess] = useState<string | null>(null);
  const [isChoosingAutomaticLocation, setIsChoosingAutomaticLocation] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('general');

  const load = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const [settingsResult, currencyResult, pathsResult, statusResult, automaticBackupResult] =
        await Promise.all([
          window.api.settings.get(),
          window.api.currencies.list({ sessionId, includeInactive: true }),
          window.api.app.getPaths(sessionId),
          window.api.app.getStatus(sessionId),
          window.api.backup.getAutomaticConfig(),
        ]);

      if (!settingsResult.ok) {
        setLoadError(mapSettingsError(tErrors, settingsResult.errorCode, settingsResult.message));
        return;
      }
      if (!currencyResult.ok) {
        setLoadError(mapSettingsError(tErrors, currencyResult.errorCode, currencyResult.message));
        return;
      }
      if (!pathsResult.ok) {
        setLoadError(mapSettingsError(tErrors, pathsResult.errorCode, pathsResult.message));
        return;
      }
      if (!statusResult.ok) {
        setLoadError(mapSettingsError(tErrors, statusResult.errorCode, statusResult.message));
        return;
      }
      if (!automaticBackupResult.ok) {
        setLoadError(mapSettingsError(tErrors, automaticBackupResult.errorCode, automaticBackupResult.message));
        return;
      }

      setSettings(settingsResult.data);
      setCurrencies(currencyResult.data.currencies);
      setPaths(pathsResult.data);
      setStatus(statusResult.data);
      setAutomaticBackup(automaticBackupResult.data);
    } catch {
      setLoadError(tErrors('INTERNAL_ERROR'));
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
    if (!paginationSuccess) {
      return;
    }
    const timer = window.setTimeout(() => setPaginationSuccess(null), 2500);
    return () => window.clearTimeout(timer);
  }, [paginationSuccess]);

  useEffect(() => {
    if (!backupSuccess) {
      return;
    }
    const timer = window.setTimeout(() => setBackupSuccess(null), 2500);
    return () => window.clearTimeout(timer);
  }, [backupSuccess]);

  useEffect(() => {
    if (!automaticBackupSuccess) {
      return;
    }
    const timer = window.setTimeout(() => setAutomaticBackupSuccess(null), 2500);
    return () => window.clearTimeout(timer);
  }, [automaticBackupSuccess]);

  async function savePagination(next: { paginationEnabled?: boolean; paginationPageSize?: number }): Promise<void> {
    if (!sessionId || isSavingPagination) {
      return;
    }

    setIsSavingPagination(true);
    setPaginationError(null);
    try {
      const result = await window.api.settings.update({ sessionId, ...next });
      if (!result.ok) {
        setPaginationError(mapSettingsError(tErrors, result.errorCode, result.message));
        return;
      }
      setSettings(result.data);
      setPaginationSuccess(t('saved'));
    } finally {
      setIsSavingPagination(false);
    }
  }

  async function createBackup(): Promise<void> {
    if (!sessionId || isCreatingBackup) {
      return;
    }

    setIsCreatingBackup(true);
    setBackupError(null);
    setBackupSuccess(null);
    setCreatedBackup(null);
    try {
      const result = await window.api.backup.create({ sessionId });
      if (!result.ok) {
        setBackupError(mapBackupError(tBackup, tErrors, result.errorCode, result.message));
        return;
      }
      if (result.data.canceled || !result.data.success) {
        return;
      }
      setCreatedBackup(result.data);
      setBackupSuccess(tBackup('success'));
    } catch {
      setBackupError(tErrors('INTERNAL_ERROR'));
    } finally {
      setIsCreatingBackup(false);
      setBackupProgress(null);
    }
  }

  async function chooseAutomaticBackupLocation(): Promise<void> {
    if (isChoosingAutomaticLocation || isCreatingBackup) {
      return;
    }

    setIsChoosingAutomaticLocation(true);
    setAutomaticBackupError(null);
    try {
      const result = await window.api.backup.chooseAutomaticLocation();
      if (!result.ok) {
        setAutomaticBackupError(mapBackupError(tBackup, tErrors, result.errorCode, result.message));
        return;
      }
      setAutomaticBackup(result.data.config);
      if (result.data.canceled) {
        return;
      }
      setAutomaticBackupSuccess(tBackup('automatic.locationSaved'));
    } catch {
      setAutomaticBackupError(tErrors('INTERNAL_ERROR'));
    } finally {
      setIsChoosingAutomaticLocation(false);
    }
  }

  async function copyDataDirectory(): Promise<void> {
    if (!paths) {
      return;
    }
    try {
      await navigator.clipboard.writeText(paths.userData);
      setCopyError(null);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError(tErrors('INTERNAL_ERROR'));
    }
  }

  const pageSizeOptions = uniquePageSizes(settings?.paginationPageSize);

  if (showRestore) {
    return (
      <div className="settings-restore-host">
        <RestorePage
          variant="settings"
          onBack={() => setShowRestore(false)}
          onRestored={() => {
            setShowRestore(false);
            void load();
          }}
        />
      </div>
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

      {isLoading ? <p>{tCommon('loading')}</p> : null}

      <div className="settings-layout">
        <nav className="settings-nav" aria-label={t('title')}>
          {SETTINGS_SECTIONS.map((section) => {
            const label = section.namespace === 'backup' ? tBackup(section.labelKey) : t(section.labelKey);
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                className={isActive ? 'settings-nav-item is-active' : 'settings-nav-item'}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => setActiveSection(section.id)}
              >
                {label}
              </button>
            );
          })}
        </nav>

        <div className="settings-content">
          {loadError ? (
            <div className="banner banner-error" role="alert">
              <span>{loadError}</span>
              <button type="button" className="button button-secondary button-compact" onClick={() => void load()}>
                {tCommon('retry')}
              </button>
            </div>
          ) : null}

          {activeSection === 'general' ? (
            <section className="card settings-section-card">
              <h2>{t('general')}</h2>
              <div className="form-field">
                <span className="field-label">{t('language')}</span>
                <LanguageSelector />
              </div>
            </section>
          ) : null}

          {activeSection === 'appearance' ? (
            <SettingsAppearanceSection settings={settings} onSaved={setSettings} />
          ) : null}

          {activeSection === 'account' ? (
            <SettingsAccountSection onPasswordChanged={clearLocalSession} />
          ) : null}

          {activeSection === 'company' ? <SettingsCompanySection /> : null}

          {activeSection === 'transactions' ? (
            <section className="card settings-section-card">
              <h2>{t('transactions')}</h2>
              {paginationError ? (
                <div className="banner banner-error" role="alert">
                  {paginationError}
                </div>
              ) : null}
              {paginationSuccess ? (
                <div className="banner banner-success" role="status">
                  {paginationSuccess}
                </div>
              ) : null}
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
          ) : null}

          {activeSection === 'currencies' ? (
            <CurrencyManagementSection
              currencies={currencies}
              onReload={load}
              mapError={(errorCode, message) => mapSettingsError(tErrors, errorCode, message)}
            />
          ) : null}

          {activeSection === 'exchange' ? (
            <SettingsExchangeSection settings={settings} onSaved={setSettings} />
          ) : null}

          {activeSection === 'backup' ? (
            <section className="card settings-section-card">
              <h2>{tBackup('title')}</h2>
              <section className="settings-subsection">
                <h3>{tBackup('automatic.title')}</h3>
                {automaticBackupError ? (
                  <div className="banner banner-error" role="alert">
                    {automaticBackupError}
                  </div>
                ) : null}
                {automaticBackupSuccess ? (
                  <div className="banner banner-success" role="status">
                    {automaticBackupSuccess}
                  </div>
                ) : null}
                {automaticBackup && !automaticBackup.configured ? (
                  <div className="banner banner-warning" role="status">
                    {tBackup('automatic.notConfigured')}
                  </div>
                ) : null}
                <dl className="status-list">
                  <div>
                    <dt>{tBackup('automatic.location')}</dt>
                    <dd className="mono">
                      {automaticBackup?.path ?? tBackup('automatic.notConfiguredPath')}
                    </dd>
                  </div>
                </dl>
                <div className="action-bar">
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => void chooseAutomaticBackupLocation()}
                    disabled={isChoosingAutomaticLocation || isCreatingBackup}
                  >
                    {isChoosingAutomaticLocation
                      ? tBackup('automatic.choosingLocation')
                      : automaticBackup?.configured
                        ? tBackup('automatic.changeLocation')
                        : tBackup('automatic.chooseLocation')}
                  </button>
                </div>
              </section>
              {backupError ? (
                <div className="banner banner-error" role="alert">
                  {backupError}
                </div>
              ) : null}
              {backupSuccess ? (
                <div className="banner banner-success" role="status">
                  {backupSuccess}
                </div>
              ) : null}
              <div className="action-bar">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => void createBackup()}
                  disabled={isCreatingBackup || isChoosingAutomaticLocation}
                >
                  {isCreatingBackup ? tBackup('creating') : tBackup('create')}
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setShowRestore(true)}
                  disabled={isCreatingBackup || isChoosingAutomaticLocation}
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
          ) : null}

          {activeSection === 'about' ? (
            <section className="card settings-section-card">
              <h2>{t('about')}</h2>
              {copyError ? (
                <div className="banner banner-error" role="alert">
                  {copyError}
                </div>
              ) : null}
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
              <button
                type="button"
                className="button button-secondary"
                onClick={() => void copyDataDirectory()}
                disabled={!paths}
              >
                {copied ? t('copied') : t('copyPath')}
              </button>
              {sessionId ? <SettingsUpdateSection sessionId={sessionId} /> : null}
            </section>
          ) : null}
        </div>
      </div>
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
