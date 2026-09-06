import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RecoverySelection } from '@shared/types/recovery';
import { changeAppLanguage } from '../i18n';
import { normalizeLocale } from '@shared/types/locale';

export function RecoveryModePage(): JSX.Element {
  const { t, i18n } = useTranslation('backup');
  const [reason, setReason] = useState('');
  const [selection, setSelection] = useState<RecoverySelection | null>(null);
  const [phase, setPhase] = useState<'idle' | 'validating' | 'restoring' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [safetyPath, setSafetyPath] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const busy = phase === 'validating' || phase === 'restoring';
  useEffect(() => {
    void window.recovery!.status().then(result => {
      if (result.ok) setReason(result.data.reason);
      else setError(result.message ?? result.errorCode);
    }).catch(error => setError(String(error)));
  }, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  async function select(): Promise<void> {
    setError(null); setSelection(null); setConfirmed(false); setPhase('validating');
    try {
      const result = await window.recovery!.select();
      if (!result.ok) throw new Error(t(result.message ?? result.errorCode, { defaultValue: result.message ?? result.errorCode }));
      setSelection(result.data);
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setPhase('idle'); }
  }
  async function restore(): Promise<void> {
    if (!confirmed || !selection || busy) return;
    setError(null); setPhase('restoring');
    try {
      const result = await window.recovery!.restore();
      if (!result.ok) throw new Error(t(result.message ?? result.errorCode, { defaultValue: result.message ?? result.errorCode }));
      setSafetyPath(result.data.safetyPath); setPhase('success');
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); setPhase('idle'); }
  }
  async function login(): Promise<void> {
    try {
      const result = await window.recovery!.login();
      if (!result.ok) setError(result.message ?? result.errorCode);
    } catch (error) { setError(String(error)); }
  }
  return <main className="recovery-mode">
    <section className="card" aria-labelledby="recovery-title" aria-busy={busy}>
      <label htmlFor="recovery-language">English / دری / پښتو</label>
      <select id="recovery-language" value={i18n.language} disabled={busy}
        onChange={event => void changeAppLanguage(normalizeLocale(event.target.value))}>
        <option value="en">English</option><option value="fa-AF">دری</option><option value="ps">پښتو</option>
      </select>
      <h1 id="recovery-title">{t('recovery.title')}</h1>
      <p>{t('recovery.explanation')}</p>
      <details><summary>{t('recovery.details')}</summary><p className="recovery-path" dir="ltr">{reason}</p></details>
      {error && <div ref={errorRef} tabIndex={-1} className="banner banner-error" role="alert">
        <strong>{t('recovery.failed')}</strong><p>{error}</p><p>{t('recovery.retry')}</p>
      </div>}
      {phase === 'success' ? <>
        <div className="banner banner-success" role="status">{t('recovery.success')}</div>
        {safetyPath && <p>{t('recovery.preserved')}<br/><span className="recovery-path" dir="ltr">{safetyPath}</span></p>}
        <button className="button button-primary" onClick={() => void login()}>{t('recovery.login')}</button>
      </> : <>
        <p>{t('recovery.scope')}</p>
        <button className="button button-secondary" disabled={busy} onClick={() => void select()}>{t('recovery.select')}</button>
        {selection && <div className="recovery-selection">
          <p className="recovery-path" dir="ltr">{selection.fileName}</p>
          <p>{t('recovery.contents', { date: selection.createdAt, customers: selection.customerCount, transactions: selection.transactionCount })}</p>
          <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)}/>{' '}{t('recovery.confirm')}</label>
          <button className="button button-primary" disabled={busy || !confirmed} onClick={() => void restore()}>{t('recovery.restore')}</button>
        </div>}
        <p role="status" aria-live="polite">{busy ? t(`recovery.${phase}`) : selection ? t('recovery.valid') : ''}</p>
      </>}
    </section>
  </main>;
}
