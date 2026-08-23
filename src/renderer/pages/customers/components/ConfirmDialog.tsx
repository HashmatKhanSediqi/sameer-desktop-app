import { useTranslation } from 'react-i18next';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isBusy?: boolean;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  isBusy = false,
  tone = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element {
  const { t } = useTranslation('common');

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title">{title}</h2>
        <p>{message}</p>
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
      </div>
    </div>
  );
}
