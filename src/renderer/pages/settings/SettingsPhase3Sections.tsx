import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { applyThemeToDocument, cloneTheme, DEFAULT_THEME, type ThemeAppearance, type ThemeMode } from '@shared/theme';
import type { AppSettings } from '@shared/types/settings';
import { CompanyProfileFields } from '../../components/CompanyProfileFields';
import { useAuth } from '../../context/AuthContext';

interface SettingsAccountSectionProps {
  onError: (message: string | null) => void;
  onSuccess: (message: string) => void;
  onPasswordChanged: () => void;
}

export function SettingsAccountSection({
  onError,
  onSuccess,
  onPasswordChanged,
}: SettingsAccountSectionProps): JSX.Element {
  const { t } = useTranslation('settings');
  const { t: tErrors } = useTranslation('errors');
  const { sessionId } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [recoveryConfigured, setRecoveryConfigured] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isSavingRecovery, setIsSavingRecovery] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    void window.api.auth.recoveryStatus({ sessionId }).then((result) => {
      if (result.ok) {
        setRecoveryConfigured(result.data.configured);
        setQuestion(result.data.question ?? '');
      }
    });
  }, [sessionId]);

  async function handlePassword(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!sessionId || isSavingPassword) {
      return;
    }
    setIsSavingPassword(true);
    onError(null);
    try {
      const result = await window.api.auth.changePassword({
        sessionId,
        currentPassword,
        newPassword,
        confirmPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      if (!result.ok) {
        onError(tErrors(result.message || result.errorCode));
        return;
      }
      onSuccess(t('passwordChanged'));
      onPasswordChanged();
    } finally {
      setIsSavingPassword(false);
    }
  }

  async function handleRecovery(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!sessionId || isSavingRecovery) {
      return;
    }
    setIsSavingRecovery(true);
    onError(null);
    try {
      const result = await window.api.auth.setRecovery({ sessionId, question, answer });
      setAnswer('');
      if (!result.ok) {
        onError(tErrors(result.message || result.errorCode));
        return;
      }
      setRecoveryConfigured(true);
      setQuestion(result.data.question ?? '');
      onSuccess(t('recoverySaved'));
    } finally {
      setIsSavingRecovery(false);
    }
  }

  return (
    <section className="card">
      <h2>{t('accountSecurity')}</h2>
      <form className="settings-stack" onSubmit={(event) => void handlePassword(event)} autoComplete="off">
        <h3>{t('changePassword')}</h3>
        <div className="form-field">
          <label htmlFor="current-password">{t('currentPassword')}</label>
          <input
            id="current-password"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="new-password">{t('newPassword')}</label>
          <input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="confirm-password">{t('confirmPassword')}</label>
          <input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <p className="field-hint">{t('passwordHint')}</p>
        <button type="submit" className="button button-primary" disabled={isSavingPassword}>
          {t('changePassword')}
        </button>
      </form>

      <form className="settings-stack" onSubmit={(event) => void handleRecovery(event)} autoComplete="off">
        <h3>{t('securityHint')}</h3>
        {!recoveryConfigured ? <p className="banner banner-warning">{t('recoveryMissing')}</p> : null}
        <div className="form-field">
          <label htmlFor="recovery-question">{t('recoveryQuestion')}</label>
          <input
            id="recovery-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="recovery-answer">{t('recoveryAnswer')}</label>
          <input
            id="recovery-answer"
            type="password"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <p className="field-hint">{t('recoveryHint')}</p>
        <button type="submit" className="button button-secondary" disabled={isSavingRecovery}>
          {t('saveRecovery')}
        </button>
      </form>
    </section>
  );
}

interface SettingsAppearanceSectionProps {
  settings: AppSettings | null;
  onSaved: (settings: AppSettings) => void;
  onError: (message: string | null) => void;
  onSuccess: (message: string) => void;
}

export function SettingsAppearanceSection({
  settings,
  onSaved,
  onError,
  onSuccess,
}: SettingsAppearanceSectionProps): JSX.Element {
  const { t } = useTranslation('settings');
  const { t: tErrors } = useTranslation('errors');
  const { sessionId } = useAuth();
  const [theme, setTheme] = useState<ThemeAppearance>(cloneTheme(settings?.theme ?? DEFAULT_THEME));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (settings?.theme) {
      setTheme(cloneTheme(settings.theme));
    }
  }, [settings]);

  async function save(next: ThemeAppearance | { resetAppearance: true }): Promise<boolean> {
    if (!sessionId || isSaving) {
      return false;
    }
    setIsSaving(true);
    onError(null);
    try {
      const result = await window.api.settings.update(
        'resetAppearance' in next ? { sessionId, resetAppearance: true } : { sessionId, theme: next },
      );
      if (!result.ok) {
        onError(tErrors(result.message || result.errorCode));
        return false;
      }
      applyThemeToDocument(result.data.theme, document.documentElement);
      setTheme(cloneTheme(result.data.theme));
      onSaved(result.data);
      onSuccess(t('appearanceSaved'));
      return true;
    } finally {
      setIsSaving(false);
    }
  }

  async function saveMode(mode: ThemeMode): Promise<void> {
    if (theme.mode === mode) {
      return;
    }
    const previous = cloneTheme(theme);
    const next = { ...theme, mode };
    applyThemeToDocument(next, document.documentElement);
    const saved = await save(next);
    if (!saved) {
      applyThemeToDocument(previous, document.documentElement);
      setTheme(previous);
    }
  }

  return (
    <section className="card">
      <h2>{t('appearance')}</h2>
      <div className="form-field">
        <span className="field-label" id="theme-mode-label">
          {t('colorMode')}
        </span>
        <div className="theme-mode-toggle" role="group" aria-labelledby="theme-mode-label">
          <button
            type="button"
            className={theme.mode === 'light' ? 'button button-primary' : 'button button-secondary'}
            disabled={isSaving}
            aria-pressed={theme.mode === 'light'}
            onClick={() => void saveMode('light')}
          >
            {t('lightMode')}
          </button>
          <button
            type="button"
            className={theme.mode === 'dark' ? 'button button-primary' : 'button button-secondary'}
            disabled={isSaving}
            aria-pressed={theme.mode === 'dark'}
            onClick={() => void saveMode('dark')}
          >
            {t('darkMode')}
          </button>
        </div>
      </div>
      <div className="color-grid">
        <ColorField
          id="theme-primary"
          label={t('primaryColor')}
          value={theme.primary}
          onChange={(primary) => setTheme({ ...theme, primary })}
        />
        <ColorField
          id="theme-accent"
          label={t('accentColor')}
          value={theme.accent}
          onChange={(accent) => setTheme({ ...theme, accent })}
        />
      </div>
      <h3>{t('cardColors')}</h3>
      <div className="color-grid">
        {(['1', '2', '3'] as const).map((slot) => (
          <div key={slot} className="card-tone-editor">
            <p>{t(`cardTone${slot}`)}</p>
            <ColorField
              id={`card-${slot}-bg`}
              label={t('cardBackground')}
              value={theme.cards[slot].background}
              onChange={(background) =>
                setTheme({
                  ...theme,
                  cards: { ...theme.cards, [slot]: { ...theme.cards[slot], background } },
                })
              }
            />
            <ColorField
              id={`card-${slot}-accent`}
              label={t('cardAccent')}
              value={theme.cards[slot].accent}
              onChange={(accent) =>
                setTheme({
                  ...theme,
                  cards: { ...theme.cards, [slot]: { ...theme.cards[slot], accent } },
                })
              }
            />
          </div>
        ))}
      </div>
      <div className="action-bar">
        <button type="button" className="button button-primary" disabled={isSaving} onClick={() => void save(theme)}>
          {t('saveAppearance')}
        </button>
        <button
          type="button"
          className="button button-secondary"
          disabled={isSaving}
          onClick={() => void save({ resetAppearance: true })}
        >
          {t('resetAppearance')}
        </button>
      </div>
    </section>
  );
}

interface SettingsCompanySectionProps {
  onError: (message: string | null) => void;
  onSuccess: (message: string) => void;
}

export function SettingsCompanySection({ onError, onSuccess }: SettingsCompanySectionProps): JSX.Element {
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
  const [removeLogo, setRemoveLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    void window.api.company.get({ sessionId }).then((result) => {
      if (!result.ok) {
        return;
      }
      setName(result.data.name ?? '');
      setPhone(result.data.phone ?? '');
      setEmail(result.data.email ?? '');
      setAddress(result.data.address ?? '');
      setWebsite(result.data.website ?? '');
      setNotes(result.data.notes ?? '');
    });
    void window.api.company.getLogo({ sessionId }).then((result) => {
      if (result.ok && result.data) {
        setLogoPreview(`data:${result.data.mimeType};base64,${result.data.dataBase64}`);
      }
    });
  }, [sessionId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!sessionId || isSaving) {
      return;
    }
    setIsSaving(true);
    onError(null);
    try {
      const result = await window.api.company.update({
        sessionId,
        name,
        phone,
        email,
        address,
        website,
        notes,
        logoBase64: logoBase64 ?? undefined,
        removeLogo,
      });
      if (!result.ok) {
        onError(tErrors(result.message || result.errorCode));
        return;
      }
      setLogoBase64(null);
      setRemoveLogo(false);
      onSuccess(t('companySaved'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="card">
      <h2>{t('companyProfile')}</h2>
      <form onSubmit={(event) => void handleSubmit(event)} autoComplete="off">
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
            setRemoveLogo(false);
          }}
          onRemoveLogo={() => {
            setLogoBase64(null);
            setLogoPreview(null);
            setRemoveLogo(true);
          }}
        />
        <button type="submit" className="button button-primary" disabled={isSaving}>
          {t('saveCompany')}
        </button>
      </form>
    </section>
  );
}

interface SettingsExchangeSectionProps {
  settings: AppSettings | null;
  onSaved: (settings: AppSettings) => void;
  onError: (message: string | null) => void;
  onSuccess: (message: string) => void;
}

export function SettingsExchangeSection({
  settings,
  onSaved,
  onError,
  onSuccess,
}: SettingsExchangeSectionProps): JSX.Element {
  const { t } = useTranslation('settings');
  const { t: tErrors } = useTranslation('errors');
  const { sessionId } = useAuth();
  const [isSaving, setIsSaving] = useState(false);

  async function toggle(enabled: boolean): Promise<void> {
    if (!sessionId || isSaving) {
      return;
    }
    setIsSaving(true);
    onError(null);
    try {
      const result = await window.api.settings.update({ sessionId, exchangeEnabled: enabled });
      if (!result.ok) {
        onError(tErrors(result.message || result.errorCode));
        return;
      }
      onSaved(result.data);
      onSuccess(t('saved'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="card">
      <h2>{t('exchange')}</h2>
      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={settings?.exchangeEnabled ?? false}
          disabled={!settings || isSaving}
          onChange={(event) => void toggle(event.target.checked)}
        />
        {t('exchangeEnabled')}
      </label>
      <p className="field-hint">{t('exchangeHint')}</p>
    </section>
  );
}

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}): JSX.Element {
  return (
    <div className="form-field color-field">
      <label htmlFor={id}>{label}</label>
      <div className="color-input-row">
        <input id={id} type="color" value={value} onChange={(event) => onChange(event.target.value)} />
        <input
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={7}
        />
      </div>
    </div>
  );
}
