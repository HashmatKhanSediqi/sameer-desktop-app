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
          <img className="login-app-icon" src={appIconUrl} alt="" width={64} height={64} />
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
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t('passwordPlaceholder')}
              disabled={isSubmitting}
              required
            />
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
