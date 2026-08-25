import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { applyThemeToDocument, cloneTheme, DEFAULT_THEME, type ThemeAppearance, type ThemeMode } from '@shared/theme';
import type { AppSettings } from '@shared/types/settings';
import { CompanyProfileFields } from '../../components/CompanyProfileFields';
import { SettingsActionModal } from '../../components/SettingsActionModal';
import { useAuth } from '../../context/AuthContext';

function SectionNotice({ error, success }: { error: string | null; success: string | null }): JSX.Element | null {
  if (error) {
    return (
      <div className="banner banner-error" role="alert">
        {error}
      </div>
    );
  }
  if (success) {
    return (
      <div className="banner banner-success" role="status">
        {success}
      </div>
    );
  }
  return null;
}

function useTimedSuccess(): [string | null, (message: string) => void] {
  const [success, setSuccess] = useState<string | null>(null);
  useEffect(() => {
    if (!success) {
      return;
    }
    const timer = window.setTimeout(() => setSuccess(null), 2500);
    return () => window.clearTimeout(timer);
  }, [success]);
  return [success, setSuccess];
}

interface SettingsAccountSectionProps {
  onPasswordChanged: () => void;
}

export function SettingsAccountSection({ onPasswordChanged }: SettingsAccountSectionProps): JSX.Element {
  const { t } = useTranslation('settings');
  const { t: tErrors } = useTranslation('errors');
  const { sessionId, username } = useAuth();
  const { t: tCommon } = useTranslation('common');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [recoveryConfigured, setRecoveryConfigured] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isSavingRecovery, setIsSavingRecovery] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoverySuccess, setRecoverySuccess] = useState<string | null>(null);

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

  function resetPasswordForm(): void {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError(null);
    setPasswordSuccess(null);
  }

  function closePasswordModal(): void {
    const succeeded = Boolean(passwordSuccess);
    setPasswordOpen(false);
    resetPasswordForm();
    if (succeeded) {
      onPasswordChanged();
    }
  }

  function closeRecoveryModal(): void {
    setRecoveryOpen(false);
    setAnswer('');
    setRecoveryError(null);
    setRecoverySuccess(null);
  }

  async function handlePassword(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!sessionId || isSavingPassword || passwordSuccess) {
      return;
    }
    setIsSavingPassword(true);
    setPasswordError(null);
    try {
      const result = await window.api.auth.changePassword({
        sessionId,
        currentPassword,
        newPassword,
        confirmPassword,
      });
      if (!result.ok) {
        setPasswordError(mapPasswordError(t, tErrors, result.errorCode, result.message));
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess(t('passwordChangedSuccess'));
    } finally {
      setIsSavingPassword(false);
    }
  }

  async function handleRecovery(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!sessionId || isSavingRecovery || recoverySuccess) {
      return;
    }
    setIsSavingRecovery(true);
    setRecoveryError(null);
    try {
      const result = await window.api.auth.setRecovery({ sessionId, question, answer });
      if (!result.ok) {
        setRecoveryError(tErrors(result.message || result.errorCode));
        return;
      }
      setAnswer('');
      setRecoveryConfigured(true);
      setQuestion(result.data.question ?? '');
      setRecoverySuccess(t('recoverySaved'));
    } finally {
      setIsSavingRecovery(false);
    }
  }

  return (
    <section className="card settings-section-card">
      <h2>{t('accountSecurity')}</h2>
      <dl className="status-list">
        <div>
          <dt>{t('username')}</dt>
          <dd>{username ?? tCommon('emptyValue')}</dd>
        </div>
        <div>
          <dt>{t('securityHint')}</dt>
          <dd>{recoveryConfigured ? t('recoveryConfigured') : t('recoveryMissing')}</dd>
        </div>
      </dl>
      <div className="action-bar">
        <button
          type="button"
          className="button button-primary"
          onClick={() => {
            resetPasswordForm();
            setPasswordOpen(true);
          }}
        >
          {t('changePassword')}
        </button>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => {
            setRecoveryError(null);
            setRecoverySuccess(null);
            setAnswer('');
            setRecoveryOpen(true);
          }}
        >
          {t('securityHint')}
        </button>
      </div>

      {passwordOpen ? (
        <SettingsActionModal
          title={t('changePassword')}
          error={passwordError}
          successMessage={passwordSuccess}
          isBusy={isSavingPassword}
          onClose={closePasswordModal}
          onSuccessClose={closePasswordModal}
        >
          <form className="settings-stack" onSubmit={(event) => void handlePassword(event)} autoComplete="off">
            <div className="form-field">
              <label htmlFor="current-password">{t('currentPassword')}</label>
              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                required
                disabled={isSavingPassword}
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
                disabled={isSavingPassword}
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
                disabled={isSavingPassword}
              />
            </div>
            <p className="field-hint">{t('passwordHint')}</p>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={closePasswordModal} disabled={isSavingPassword}>
                {tCommon('cancel')}
              </button>
              <button type="submit" className="button button-primary" disabled={isSavingPassword}>
                {t('changePassword')}
              </button>
            </div>
          </form>
        </SettingsActionModal>
      ) : null}

      {recoveryOpen ? (
        <SettingsActionModal
          title={t('securityHint')}
          error={recoveryError}
          successMessage={recoverySuccess}
          isBusy={isSavingRecovery}
          onClose={closeRecoveryModal}
          onSuccessClose={closeRecoveryModal}
        >
          <form className="settings-stack" onSubmit={(event) => void handleRecovery(event)} autoComplete="off">
            {!recoveryConfigured ? <p className="banner banner-warning">{t('recoveryMissing')}</p> : null}
            <div className="form-field">
              <label htmlFor="recovery-question">{t('recoveryQuestion')}</label>
              <input
                id="recovery-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                required
                disabled={isSavingRecovery}
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
                disabled={isSavingRecovery}
              />
            </div>
            <p className="field-hint">{t('recoveryHint')}</p>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={closeRecoveryModal} disabled={isSavingRecovery}>
                {tCommon('cancel')}
              </button>
              <button type="submit" className="button button-primary" disabled={isSavingRecovery}>
                {t('saveRecovery')}
              </button>
            </div>
          </form>
        </SettingsActionModal>
      ) : null}
    </section>
  );
}

interface SettingsAppearanceSectionProps {
  settings: AppSettings | null;
  onSaved: (settings: AppSettings) => void;
}

export function SettingsAppearanceSection({
  settings,
  onSaved,
}: SettingsAppearanceSectionProps): JSX.Element {
  const { t } = useTranslation('settings');
  const { t: tErrors } = useTranslation('errors');
  const { sessionId } = useAuth();
  const [theme, setTheme] = useState<ThemeAppearance>(cloneTheme(settings?.theme ?? DEFAULT_THEME));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useTimedSuccess();

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
    setError(null);
    try {
      const result = await window.api.settings.update(
        'resetAppearance' in next ? { sessionId, resetAppearance: true } : { sessionId, theme: next },
      );
      if (!result.ok) {
        setError(tErrors(result.message || result.errorCode));
        return false;
      }
      applyThemeToDocument(result.data.theme, document.documentElement);
      setTheme(cloneTheme(result.data.theme));
      onSaved(result.data);
      setSuccess(t('appearanceSaved'));
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
    <section className="card settings-section-card">
      <h2>{t('appearance')}</h2>
      <SectionNotice error={error} success={success} />
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

export function SettingsCompanySection(): JSX.Element {
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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useTimedSuccess();

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
        logoBase64: logoBase64 ?? undefined,
        removeLogo,
      });
      if (!result.ok) {
        setError(tErrors(result.message || result.errorCode));
        return;
      }
      setLogoBase64(null);
      setRemoveLogo(false);
      setSuccess(t('companySaved'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="card settings-section-card">
      <h2>{t('companyProfile')}</h2>
      <SectionNotice error={error} success={success} />
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
}

export function SettingsExchangeSection({
  settings,
  onSaved,
}: SettingsExchangeSectionProps): JSX.Element {
  const { t } = useTranslation('settings');
  const { t: tErrors } = useTranslation('errors');
  const { sessionId } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useTimedSuccess();

  async function toggle(enabled: boolean): Promise<void> {
    if (!sessionId || isSaving) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const result = await window.api.settings.update({ sessionId, exchangeEnabled: enabled });
      if (!result.ok) {
        setError(tErrors(result.message || result.errorCode));
        return;
      }
      onSaved(result.data);
      setSuccess(t('saved'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="card settings-section-card">
      <h2>{t('exchange')}</h2>
      <SectionNotice error={error} success={success} />
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

function mapPasswordError(
  translateSettings: (key: string) => string,
  translateErrors: (key: string) => string,
  errorCode: string,
  message?: string,
): string {
  if (errorCode === 'INVALID_CREDENTIALS') {
    return translateSettings('currentPasswordIncorrect');
  }
  if (message) {
    const fromSettings = translateSettings(message);
    if (fromSettings !== message) {
      return fromSettings;
    }
    const fromErrors = translateErrors(message);
    if (fromErrors !== message) {
      return fromErrors;
    }
  }
  const fromCode = translateErrors(errorCode);
  return fromCode === errorCode ? translateErrors('INTERNAL_ERROR') : fromCode;
}
