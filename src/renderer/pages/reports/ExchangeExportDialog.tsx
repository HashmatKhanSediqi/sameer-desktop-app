import { useTranslation } from 'react-i18next';

interface ExchangeExportDialogProps {
  onInclude: () => void;
  onExclude: () => void;
  onCancel: () => void;
}

export function ExchangeExportDialog({ onInclude, onExclude, onCancel }: ExchangeExportDialogProps): JSX.Element {
  const { t } = useTranslation('reports');
  const { t: tCommon } = useTranslation('common');
  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div className="modal-dialog confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="exchange-export-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="exchange-export-title">{t('exchangeExport.title')}</h2>
        <p>{t('exchangeExport.question')}</p>
        <div className="modal-actions">
          <button type="button" className="button button-secondary" onClick={onCancel}>{tCommon('cancel')}</button>
          <button type="button" className="button button-secondary" onClick={onExclude}>{t('exchangeExport.without')}</button>
          <button type="button" className="button button-primary" onClick={onInclude}>{t('exchangeExport.include')}</button>
        </div>
      </div>
    </div>
  );
}
