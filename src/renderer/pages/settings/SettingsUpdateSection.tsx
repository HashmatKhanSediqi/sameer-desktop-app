import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UpdateStatusSnapshot } from '@shared/types/update';

interface SettingsUpdateSectionProps {
  sessionId: string;
}

export function SettingsUpdateSection({ sessionId }: SettingsUpdateSectionProps): JSX.Element {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const [status, setStatus] = useState<UpdateStatusSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const applyStatus = useCallback((next: UpdateStatusSnapshot): void => {
    setStatus(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void window.api.update.getStatus({ sessionId }).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.ok) {
        applyStatus(result.data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, applyStatus]);

  useEffect(() => {
    return window.api.update.onStatus((next) => {
      applyStatus(next);
    });
  }, [applyStatus]);

  const runCheck = async (): Promise<void> => {
    setBusy(true);
    setActionError(null);
    try {
      const result = await window.api.update.check({ sessionId });
      if (!result.ok) {
        setActionError(mapUpdateError(t, tErrors, result.errorCode, result.message));
        return;
      }
      applyStatus(result.data);
    } catch {
      setActionError(tErrors('INTERNAL_ERROR'));
    } finally {
      setBusy(false);
    }
  };

  const runDownload = async (): Promise<void> => {
    setBusy(true);
    setActionError(null);
    try {
      const result = await window.api.update.download({ sessionId });
      if (!result.ok) {
        setActionError(mapUpdateError(t, tErrors, result.errorCode, result.message));
        return;
      }
      applyStatus(result.data);
    } catch {
      setActionError(tErrors('INTERNAL_ERROR'));
    } finally {
      setBusy(false);
    }
  };

  const runInstall = async (): Promise<void> => {
    setBusy(true);
    setActionError(null);
    try {
      const result = await window.api.update.install({ sessionId });
      if (!result.ok) {
        setActionError(mapUpdateError(t, tErrors, result.errorCode, result.message));
        setBusy(false);
        return;
      }
      applyStatus(result.data);
      // App should quit for installer; keep busy if still visible.
    } catch {
      setActionError(tErrors('INTERNAL_ERROR'));
      setBusy(false);
    }
  };

  const state = status?.state ?? 'idle';
  const percent = Math.max(0, Math.min(100, Math.round(status?.progress?.percent ?? 0)));

  return (
    <div className="update-section">
      <h3>{t('updates.title')}</h3>
      <dl className="status-list">
        <div>
          <dt>{t('updates.currentVersion')}</dt>
          <dd>{status?.currentVersion ?? tCommon('emptyValue')}</dd>
        </div>
        {status?.availableVersion ? (
          <div>
            <dt>{t('updates.availableVersion')}</dt>
            <dd>{status.availableVersion}</dd>
          </div>
        ) : null}
        <div>
          <dt>{t('updates.status')}</dt>
          <dd>{t(`updates.states.${state}`)}</dd>
        </div>
      </dl>

      {state === 'downloading' ? (
        <div className="backup-progress" role="status">
          <div className="backup-progress-bar" style={{ width: `${percent}%` }} />
          <p>{t('updates.downloadingProgress', { percent })}</p>
        </div>
      ) : null}

      {state === 'error' || actionError ? (
        <p className="form-error" role="alert">
          {actionError ??
            (status?.errorCode
              ? mapUpdateError(t, tErrors, status.errorCode, status.errorMessage)
              : t('updates.errors.generic'))}
        </p>
      ) : null}

      {state === 'ready' ? <p className="form-hint">{t('updates.readyHint')}</p> : null}

      <div className="button-row">
        <button
          type="button"
          className="button button-secondary"
          disabled={busy || state === 'checking' || state === 'downloading' || state === 'unsupported'}
          onClick={() => void runCheck()}
        >
          {state === 'checking' ? t('updates.checking') : t('updates.checkForUpdates')}
        </button>

        {state === 'available' || (state === 'error' && status?.availableVersion) ? (
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => void runDownload()}
          >
            {t('updates.download')}
          </button>
        ) : null}

        {state === 'ready' ? (
          <button type="button" className="button" disabled={busy} onClick={() => void runInstall()}>
            {t('updates.restartAndInstall')}
          </button>
        ) : null}
      </div>

      {state === 'unsupported' ? <p className="form-hint">{t('updates.unsupportedHint')}</p> : null}
    </div>
  );
}

function mapUpdateError(
  tSettings: (key: string) => string,
  tErrors: (key: string) => string,
  errorCode?: string | null,
  message?: string | null,
): string {
  if (errorCode === 'UPDATE_BACKUP_FAILED' || message === 'backupFailed') {
    return tSettings('updates.errors.backupFailed');
  }
  if (errorCode === 'UPDATE_CHECK_FAILED' || message === 'checkFailed') {
    return tSettings('updates.errors.checkFailed');
  }
  if (errorCode === 'UPDATE_DOWNLOAD_FAILED' || message === 'downloadFailed') {
    return tSettings('updates.errors.downloadFailed');
  }
  if (errorCode === 'UPDATE_UNSUPPORTED' || message === 'unsupportedEnvironment') {
    return tSettings('updates.errors.unsupported');
  }
  if (errorCode === 'UPDATE_NOT_AVAILABLE' || message === 'notAvailable') {
    return tSettings('updates.errors.notAvailable');
  }
  if (errorCode === 'UPDATE_NOT_READY' || message === 'notReady') {
    return tSettings('updates.errors.notReady');
  }
  if (errorCode === 'UPDATE_INVALID_VERSION' || message === 'invalidVersion') {
    return tSettings('updates.errors.invalidVersion');
  }
  if (errorCode && tErrors(errorCode) !== errorCode) {
    return tErrors(errorCode);
  }
  return tSettings('updates.errors.generic');
}
