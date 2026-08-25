import { useEffect, useRef, type ReactNode } from 'react';
import { ACTION_SUCCESS_DISMISS_MS, ActionSuccessState } from './ActionSuccessState';

interface SettingsActionModalProps {
  title: string;
  error?: string | null;
  successMessage?: string | null;
  isBusy?: boolean;
  onClose: () => void;
  onSuccessClose?: () => void;
  children: ReactNode;
}

export function SettingsActionModal({
  title,
  error,
  successMessage,
  isBusy = false,
  onClose,
  onSuccessClose,
  children,
}: SettingsActionModalProps): JSX.Element {
  const successCloseRef = useRef(onSuccessClose ?? onClose);
  successCloseRef.current = onSuccessClose ?? onClose;

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
      onClick={lockDismiss ? undefined : onClose}
    >
      <div
        className="modal-dialog settings-action-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-action-title"
        onClick={(event) => event.stopPropagation()}
      >
        {successMessage ? (
          <ActionSuccessState message={successMessage} />
        ) : (
          <>
            <h2 id="settings-action-title">{title}</h2>
            {error ? (
              <div className="banner banner-error" role="alert">
                {error}
              </div>
            ) : null}
            {children}
          </>
        )}
      </div>
    </div>
  );
}
