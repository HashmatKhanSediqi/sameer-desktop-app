import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from '../../components/LanguageSelector';

interface RecoveryPageProps {
  onBack: () => void;
  onRecovered: () => void;
}

export function RecoveryPage({ onBack, onRecovered }: RecoveryPageProps): JSX.Element {
  const { t } = useTranslation('auth');
  const { t: tErrors } = useTranslation('errors');
  const [username, setUsername] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function loadQuestion(): Promise<void> {
    const result = await window.api.auth.recoveryPrompt({ username });
    if (result.ok) {
      setQuestion(result.data.question);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setIsBusy(true);
    try {
      const result = await window.api.auth.recoverPassword({
        username,
        answer,
        newPassword,
        confirmPassword,
      });
      if (!result.ok) {
        setError(tErrors(result.message || result.errorCode) || t('recoveryFailed'));
        return;
      }
      setAnswer('');
      setNewPassword('');
      setConfirmPassword('');
      onRecovered();
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-language">
        <LanguageSelector />
      </div>
      <div className="login-card">
        <h1>{t('recoveryTitle')}</h1>
        <p className="login-subtitle">{t('recoverySubtitle')}</p>
        <form className="login-form" onSubmit={(event) => void handleSubmit(event)} autoComplete="off">
          <div className="form-field">
            <label htmlFor="recovery-username">{t('usernameLabel')}</label>
            <input
              id="recovery-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              onBlur={() => void loadQuestion()}
              autoComplete="off"
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="recovery-answer">{question || t('recoveryAnswerLabel')}</label>
            <input
              id="recovery-answer"
              type="password"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="recovery-password">{t('newPasswordLabel')}</label>
            <input
              id="recovery-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="recovery-confirm">{t('confirmPasswordLabel')}</label>
            <input
              id="recovery-confirm"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          {error ? (
            <div className="banner banner-error" role="alert">
              {error}
            </div>
          ) : null}
          <button type="submit" className="button button-primary" disabled={isBusy}>
            {t('resetPassword')}
          </button>
          <button type="button" className="button button-secondary" onClick={onBack} disabled={isBusy}>
            {t('backToLogin')}
          </button>
        </form>
      </div>
    </div>
  );
}
