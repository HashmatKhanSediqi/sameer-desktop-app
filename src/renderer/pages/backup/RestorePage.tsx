import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BackupManifestSummary, BackupProgress } from '@shared/types/backup';
import { useLocaleFormat } from '../../hooks/useLocaleFormat';
import { LanguageSelector } from '../../components/LanguageSelector';

interface RestorePageProps {
  variant: 'prelogin' | 'settings';
  onBack: () => void;
  onRestored: () => void;
}

export function RestorePage({ variant, onBack, onRestored }: RestorePageProps): JSX.Element {
  const { t } = useTranslation('backup');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const { formatDate } = useLocaleFormat();
  const [isValidating, setIsValidating] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [manifest, setManifest] = useState<BackupManifestSummary | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [restored, setRestored] = useState<{ safetyBackupPath?: string } | null>(null);

  useEffect(() => {
    return window.api.backup.onProgress((next) => setProgress(next));
  }, []);

  async function selectBackup(): Promise<void> {
    setIsValidating(true);
    setError(null);
    setWarnings([]);
    setManifest(null);
    setFileName(null);
    setSelectedPath(null);
    setConfirmed(false);
    setRestored(null);

    try {
      const result = await window.api.backup.validate();
      if (!result.ok) {
        setError(mapBackupError(t, tErrors, result.errorCode, result.message));
        return;
      }
      if (result.data.canceled) {
        return;
      }
      setFileName(result.data.fileName ?? null);
      setSelectedPath(result.data.filePath ?? null);
      if (!result.data.valid || !result.data.manifest) {
        setError(
          result.data.errors.map((code) => t(code, { defaultValue: t('invalidBackup') })).join(' '),
        );
        return;
      }
      setManifest(result.data.manifest);
      setWarnings(result.data.warnings);
    } catch {
      setError(tErrors('INTERNAL_ERROR'));
    } finally {
      setIsValidating(false);
    }
  }

  async function restore(): Promise<void> {
    if (!confirmed || !manifest) {
      return;
    }

    setIsRestoring(true);
    setError(null);
    try {
      const result = await window.api.backup.restore({
        confirmed: true,
        filePath: selectedPath ?? undefined,
      });
      if (!result.ok) {
        setError(mapBackupError(t, tErrors, result.errorCode, result.message));
        return;
      }
      setRestored({ safetyBackupPath: result.data.safetyBackupPath });
    } catch {
      setError(tErrors('INTERNAL_ERROR'));
    } finally {
      setIsRestoring(false);
      setProgress(null);
    }
  }

  const cardClass = variant === 'prelogin' ? 'login-card card restore-card' : 'card';

  if (restored) {
    return (
      <section className={variant === 'prelogin' ? 'login-page' : 'customer-page'}>
        <div className={cardClass}>
          <h2>{t('restoreTitle')}</h2>
          <div className="banner banner-success" role="status">
            {t('successRestore')}
          </div>
          {restored.safetyBackupPath ? (
            <p className="field-hint">
              {t('safetyBackupCreated')}: <span className="mono">{restored.safetyBackupPath}</span>
            </p>
          ) : null}
          <div className="modal-actions">
            <button type="button" className="button button-primary" onClick={onRestored}>
              {variant === 'prelogin' ? t('continueToLogin') : tCommon('back')}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={variant === 'prelogin' ? 'login-page' : 'customer-page'}>
      {variant === 'prelogin' ? (
        <div className="login-language">
          <LanguageSelector />
        </div>
      ) : null}
      <div className={cardClass}>
        <div className="page-header">
          <button type="button" className="button button-secondary" onClick={onBack} disabled={isRestoring}>
            {tCommon('back')}
          </button>
          <h2>{variant === 'prelogin' ? t('restoreTitle') : t('restoreFromBackup')}</h2>
        </div>

        {error ? (
          <div className="banner banner-error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="action-bar">
          <button
            type="button"
            className="button button-primary"
            onClick={() => void selectBackup()}
            disabled={isValidating || isRestoring}
          >
            {isValidating ? t('validating') : t('selectBackup')}
          </button>
        </div>

        {fileName && manifest ? <p className="field-hint mono">{fileName}</p> : null}

        {manifest ? (
          <dl className="status-list">
            <div>
              <dt>{t('backupDate')}</dt>
              <dd>{formatDate(manifest.createdAt)}</dd>
            </div>
            <div>
              <dt>{t('appVersion')}</dt>
              <dd>{manifest.appVersion}</dd>
            </div>
            <div>
              <dt>{t('schemaVersion')}</dt>
              <dd>{manifest.schemaVersion}</dd>
            </div>
            <div>
              <dt>{t('customerCount')}</dt>
              <dd>{manifest.customerCount}</dd>
            </div>
            <div>
              <dt>{t('transactionCount')}</dt>
              <dd>{manifest.transactionCount}</dd>
            </div>
            <div>
              <dt>{t('language')}</dt>
              <dd>{manifest.language}</dd>
            </div>
          </dl>
        ) : null}

        {warnings.map((warning) => (
          <p key={warning} className="field-hint" role="status">
            {t(warning)}
          </p>
        ))}

        {manifest ? (
          <div className="banner banner-warning" role="status">
            {t('existingDataWarning')}
          </div>
        ) : null}

        {manifest ? (
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={isRestoring}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            {t('confirmReplace')}
          </label>
        ) : null}

        {progress ? (
          <div className="backup-progress" role="status">
            <div className="backup-progress-bar" style={{ width: `${Math.max(0, Math.min(progress.percent, 100))}%` }} />
            <p>{t(`progress.${progress.stage}`, { defaultValue: t('restoring') })}</p>
          </div>
        ) : null}

        <div className="modal-actions">
          <button type="button" className="button button-secondary" onClick={onBack} disabled={isRestoring}>
            {t('cancel')}
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => void restore()}
            disabled={!manifest || !confirmed || isRestoring}
          >
            {isRestoring ? t('restoring') : t('confirm')}
          </button>
        </div>
      </div>
    </section>
  );
}

function mapBackupError(
  tBackup: (key: string) => string,
  tErrors: (key: string) => string,
  errorCode: string,
  message?: string,
): string {
  if (message) {
    const translated = tBackup(message);
    if (translated !== message) {
      return translated;
    }
    const fromErrors = tErrors(message);
    if (fromErrors !== message) {
      return fromErrors;
    }
  }
  const translatedCode = tErrors(errorCode);
  return translatedCode === errorCode ? tErrors('INTERNAL_ERROR') : translatedCode;
}
