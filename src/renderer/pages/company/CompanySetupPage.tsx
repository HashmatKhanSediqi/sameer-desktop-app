import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { CompanyProfileFields } from '../../components/CompanyProfileFields';

interface CompanySetupPageProps {
  onSaved: () => void;
}

export function CompanySetupPage({ onSaved }: CompanySetupPageProps): JSX.Element {
  const { t } = useTranslation('settings');
  const { t: tErrors } = useTranslation('errors');
  const { sessionId } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [website, setWebsite] = useState('');
  const [notes, setNotes] = useState('');
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!sessionId) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const result = await window.api.company.update({
        sessionId,
        name,
        phone,
        email,
        address,
        website,
        notes,
        logoBase64,
      });
      if (!result.ok) {
        setError(tErrors(result.message || result.errorCode));
        return;
      }
      onSaved();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="company-setup-page">
      <section className="company-setup-card">
        <header className="company-setup-header">
          <h2>{t('companySetupTitle')}</h2>
          <p className="company-setup-hint">{t('companySetupHint')}</p>
        </header>
        {error ? (
          <div className="banner banner-error" role="alert">
            {error}
          </div>
        ) : null}
        <form className="company-setup-form" onSubmit={(event) => void handleSubmit(event)} autoComplete="off">
          <CompanyProfileFields
            name={name}
            phone={phone}
            email={email}
            address={address}
            website={website}
            notes={notes}
            logoPreview={logoPreview}
            onName={setName}
            onPhone={setPhone}
            onEmail={setEmail}
            onAddress={setAddress}
            onWebsite={setWebsite}
            onNotes={setNotes}
            onLogo={(dataUrl) => {
              setLogoBase64(dataUrl);
              setLogoPreview(dataUrl);
            }}
            onRemoveLogo={() => {
              setLogoBase64(null);
              setLogoPreview(null);
            }}
          />
          <div className="company-setup-actions">
            <button type="submit" className="button button-primary" disabled={isSaving}>
              {t('saveCompany')}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
