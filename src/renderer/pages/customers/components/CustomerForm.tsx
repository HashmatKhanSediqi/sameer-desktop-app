import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Customer } from '@shared/types/customer';
import { useAuth } from '../../../context/AuthContext';
import { CustomerAvatar, invalidateCustomerPhotoCache } from './CustomerAvatar';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

interface CustomerFormProps {
  mode: 'create' | 'edit';
  customer?: Customer;
  onCancel: () => void;
  onSaved: (customer: Customer) => void;
}

export function CustomerForm({ mode, customer, onCancel, onSaved }: CustomerFormProps): JSX.Element {
  const { t } = useTranslation('customers');
  const { t: tCommon } = useTranslation('common');
  const { sessionId } = useAuth();
  const [name, setName] = useState(customer?.name ?? '');
  const [customerNumber, setCustomerNumber] = useState(customer?.customerNumber ?? '');
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !isSubmitting) {
        onCancel();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSubmitting, onCancel]);

  async function handlePhotoChange(file: File | undefined): Promise<void> {
    setError(null);

    if (!file) {
      return;
    }

    if (file.size > MAX_PHOTO_BYTES) {
      setError(t('errors.PHOTO_TOO_LARGE'));
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setPhotoBase64(dataUrl);
      setPhotoPreview(dataUrl);
      setRemovePhoto(false);
    } catch {
      setError(t('errors.INVALID_PHOTO'));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!sessionId || isSubmitting) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const result =
        mode === 'create'
          ? await window.api.customers.create({
              sessionId,
              name,
              customerNumber,
              photoBase64,
            })
          : await window.api.customers.update({
              sessionId,
              id: customer!.id,
              name,
              customerNumber,
              photoBase64,
              removePhoto,
            });

      if (!result.ok) {
        setError(mapCustomerError((key) => String(t(key as never)), result.errorCode, result.message));
        return;
      }

      if (mode === 'edit') {
        invalidateCustomerPhotoCache(result.data.id);
      }

      onSaved(result.data);
    } finally {
      setIsSubmitting(false);
    }
  }

  const showExistingPhoto = mode === 'edit' && customer?.hasPhoto && !removePhoto && !photoPreview;

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-dialog modal-dialog-form" role="dialog" aria-modal="true">
        <h2>{mode === 'create' ? t('add') : t('edit')}</h2>

        <form className="customer-form" onSubmit={(event) => void handleSubmit(event)} autoComplete="off">
          <div className="form-field">
            <label htmlFor="customer-name">
              {t('name')} <span className="optional-label">({t('optional')})</span>
            </label>
            <input
              id="customer-name"
              name="customer-name"
              type="text"
              maxLength={200}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="form-field">
            <label htmlFor="customer-number">
              {t('number')} <span className="optional-label">({t('optional')})</span>
            </label>
            <input
              id="customer-number"
              name="customer-number"
              type="text"
              maxLength={50}
              value={customerNumber}
              onChange={(event) => setCustomerNumber(event.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="form-field">
            <span className="field-label">
              {t('photo')} <span className="optional-label">({t('optional')})</span>
            </span>
            <div className="photo-row">
              {photoPreview ? (
                <img className="customer-avatar customer-avatar-lg" src={photoPreview} alt="" />
              ) : showExistingPhoto && customer ? (
                <CustomerAvatar customerId={customer.id} name={customer.name} hasPhoto size="lg" />
              ) : (
                <span className="customer-avatar customer-avatar-lg customer-avatar-fallback">?</span>
              )}
              <div className="photo-actions">
                <label className="button button-secondary file-button">
                  {t('choosePhoto')}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    disabled={isSubmitting}
                    onChange={(event) => void handlePhotoChange(event.target.files?.[0])}
                  />
                </label>
                {mode === 'edit' && customer?.hasPhoto && !removePhoto ? (
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={isSubmitting}
                    onClick={() => {
                      setRemovePhoto(true);
                      setPhotoBase64(null);
                      setPhotoPreview(null);
                    }}
                  >
                    {t('removePhoto')}
                  </button>
                ) : null}
                <p className="field-hint">{t('photoHint')}</p>
              </div>
            </div>
          </div>

          {error ? (
            <div className="banner banner-error" role="alert">
              {error}
            </div>
          ) : null}

          <div className="modal-actions">
            <button type="button" className="button button-secondary" onClick={onCancel} disabled={isSubmitting}>
              {t('cancel')}
            </button>
            <button type="submit" className="button button-primary" disabled={isSubmitting}>
              {isSubmitting ? tCommon('loading') : t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function mapCustomerError(
  translate: (key: string) => string,
  errorCode: string,
  message?: string,
): string {
  if (errorCode === 'VALIDATION_ERROR' && message) {
    const key = `validation.${message}`;
    const translated = translate(key);
    if (translated !== key) {
      return translated;
    }
  }

  if (errorCode === 'INVALID_PHOTO' && message === 'PHOTO_TOO_LARGE') {
    return translate('errors.PHOTO_TOO_LARGE');
  }

  const errorKey = `errors.${errorCode}`;
  const translated = translate(errorKey);
  return translated === errorKey ? translate('errors.INTERNAL_ERROR') : translated;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
