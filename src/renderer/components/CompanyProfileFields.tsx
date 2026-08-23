import { useTranslation } from 'react-i18next';

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

interface CompanyProfileFieldsProps {
  name: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  notes: string;
  logoPreview: string | null;
  onName: (value: string) => void;
  onPhone: (value: string) => void;
  onEmail: (value: string) => void;
  onAddress: (value: string) => void;
  onWebsite: (value: string) => void;
  onNotes: (value: string) => void;
  onLogo: (dataUrl: string) => void;
  onRemoveLogo: () => void;
  disabled?: boolean;
}

export function CompanyProfileFields({
  name,
  phone,
  email,
  address,
  website,
  notes,
  logoPreview,
  onName,
  onPhone,
  onEmail,
  onAddress,
  onWebsite,
  onNotes,
  onLogo,
  onRemoveLogo,
  disabled,
}: CompanyProfileFieldsProps): JSX.Element {
  const { t } = useTranslation('settings');
  const { t: tErrors } = useTranslation('errors');

  async function handleLogo(file: File | undefined): Promise<void> {
    if (!file) {
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      window.alert(tErrors('PHOTO_TOO_LARGE'));
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    onLogo(dataUrl);
  }

  return (
    <div className="company-fields">
      <div className="form-field company-field-name">
        <label htmlFor="company-name">{t('companyName')}</label>
        <input id="company-name" value={name} onChange={(event) => onName(event.target.value)} required disabled={disabled} />
      </div>
      <div className="form-field company-field-phone">
        <label htmlFor="company-phone">{t('companyPhone')}</label>
        <input id="company-phone" value={phone} onChange={(event) => onPhone(event.target.value)} disabled={disabled} />
      </div>
      <div className="form-field company-field-email">
        <label htmlFor="company-email">{t('companyEmail')}</label>
        <input id="company-email" type="email" value={email} onChange={(event) => onEmail(event.target.value)} disabled={disabled} />
      </div>
      <div className="form-field company-field-address">
        <label htmlFor="company-address">{t('companyAddress')}</label>
        <textarea id="company-address" value={address} onChange={(event) => onAddress(event.target.value)} disabled={disabled} rows={2} />
      </div>
      <div className="form-field company-field-website">
        <label htmlFor="company-website">
          {t('companyWebsite')} <span className="optional-label">({t('optional')})</span>
        </label>
        <input id="company-website" value={website} onChange={(event) => onWebsite(event.target.value)} disabled={disabled} />
      </div>
      <div className="form-field company-field-notes">
        <label htmlFor="company-notes">{t('companyNotes')}</label>
        <textarea id="company-notes" value={notes} onChange={(event) => onNotes(event.target.value)} disabled={disabled} rows={3} />
      </div>
      <div className="form-field company-field-logo">
        <span className="field-label">{t('companyLogo')}</span>
        {logoPreview ? <img className="company-logo-preview" src={logoPreview} alt="" /> : <p className="field-hint company-logo-empty">{t('logoEmpty')}</p>}
        <div className="action-bar">
          <label className="button button-secondary">
            {t('chooseLogo')}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              disabled={disabled}
              onChange={(event) => void handleLogo(event.target.files?.[0])}
            />
          </label>
          {logoPreview ? (
            <button type="button" className="button button-danger" onClick={onRemoveLogo} disabled={disabled}>
              {t('removeLogo')}
            </button>
          ) : null}
        </div>
        <p className="field-hint">{t('logoHint')}</p>
      </div>
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
