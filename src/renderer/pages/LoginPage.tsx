import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from '../components/LanguageSelector';
import { useAuth } from '../context/AuthContext';

const appIconUrl = new URL('../../../assets/icons/iconn.png', import.meta.url).href;

interface LoginPageProps {
  onImportExisting: () => void;
  onForgotPassword: () => void;
  recovered?: boolean;
}

export function LoginPage({ onImportExisting, onForgotPassword, recovered }: LoginPageProps): JSX.Element {
  const { t } = useTranslation('auth');
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorCode(null);
    setIsSubmitting(true);

    try {
      const result = await login(username, password);
      if (!result.ok) {
        setErrorCode(result.errorCode);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-backdrop" aria-hidden="true">
        <span className="login-orb login-orb-a" />
        <span className="login-orb login-orb-b" />
        <span className="login-orb login-orb-c" />
      </div>
      <div className="login-language">
        <LanguageSelector />
      </div>
      <div className="login-card">
        <div className="login-brand">
          <img className="login-app-icon" src={appIconUrl} alt="" width={56} height={56} />
          <h1>{t('title')}</h1>
          <p className="login-subtitle">{t('subtitle')}</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit} autoComplete="off">
          <div className="form-field">
            <label htmlFor="username">{t('usernameLabel')}</label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="off"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={t('usernamePlaceholder')}
              disabled={isSubmitting}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="password">{t('passwordLabel')}</label>
            <div className="password-input-wrap">
              <input
                id="password"
                name="password"
                type={passwordVisible ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t('passwordPlaceholder')}
                disabled={isSubmitting}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setPasswordVisible((visible) => !visible)}
                aria-label={passwordVisible ? t('hidePassword') : t('showPassword')}
                title={passwordVisible ? t('hidePassword') : t('showPassword')}
                aria-pressed={passwordVisible}
                disabled={isSubmitting}
              >
                {passwordVisible ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          {recovered ? (
            <div className="banner banner-success" role="status">
              {t('recoverySuccess')}
            </div>
          ) : null}

          {errorCode && (
            <div className="banner banner-error" role="alert">
              {t('invalidCredentials')}
            </div>
          )}

          <button type="submit" className="button button-primary login-submit" disabled={isSubmitting}>
            {t('loginButton')}
          </button>
          <button type="button" className="button-link" onClick={onForgotPassword}>
            {t('forgotPassword')}
          </button>
        </form>

        <p className="login-footer">
          <button type="button" className="button-link" onClick={onImportExisting}>
            {t('importExistingSystem')}
          </button>
        </p>
      </div>
    </div>
  );
}

function EyeIcon(): JSX.Element {
  return (
    <svg className="password-toggle-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function EyeOffIcon(): JSX.Element {
  return (
    <svg className="password-toggle-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 3l18 18M9.9 9.9A3 3 0 0 0 12 15a3 3 0 0 0 2.1-.9M6.5 6.7C4.4 8.1 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.7 0 3.2-.4 4.5-1M17.5 6.7C19.6 8.1 21.5 12 21.5 12s-.6 1.1-1.7 2.3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
