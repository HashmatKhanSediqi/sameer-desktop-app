import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ACTION_SUCCESS_DISMISS_MS, ActionSuccessState } from '../../../components/ActionSuccessState';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isBusy?: boolean;
  tone?: 'danger' | 'primary';
  error?: string | null;
  successMessage?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  onSuccessClose?: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  isBusy = false,
  tone = 'danger',
  error = null,
  successMessage = null,
  onConfirm,
  onCancel,
  onSuccessClose,
}: ConfirmDialogProps): JSX.Element {
  const { t } = useTranslation('common');
  const successCloseRef = useRef(onSuccessClose ?? onCancel);
  successCloseRef.current = onSuccessClose ?? onCancel;

  useEffect(() => {
    if (!successMessage) {
      return;
    }
    const timer = window.setTimeout(() => {
      successCloseRef.current();
    }, ACTION_SUCCESS_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  const lockDismiss = isBusy || Boolean(successMessage);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={lockDismiss ? undefined : onCancel}
    >
      <div
        className="modal-dialog confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        {successMessage ? (
          <ActionSuccessState message={successMessage} />
        ) : (
          <>
            <h2 id="confirm-dialog-title">{title}</h2>
            <p>{message}</p>
            {error ? (
              <div className="banner banner-error" role="alert">
                {error}
              </div>
            ) : null}
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={onCancel} disabled={isBusy}>
                {cancelLabel ?? t('cancel')}
              </button>
              <button
                type="button"
                className={tone === 'primary' ? 'button button-primary' : 'button button-danger'}
                onClick={onConfirm}
                disabled={isBusy}
              >
                {confirmLabel ?? t('delete')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
