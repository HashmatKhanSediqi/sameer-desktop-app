import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../context/AuthContext';

interface TellerCurrencyFormProps {
  onCreated: (code: string) => void;
}

export function TellerCurrencyForm({ onCreated }: TellerCurrencyFormProps): JSX.Element {
  const { t } = useTranslation('teller');
  const { t: tErrors } = useTranslation('errors');
  const { sessionId } = useAuth();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [denoms, setDenoms] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!sessionId || saving) {
      return;
    }
    const values = denoms
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    if (values.length === 0) {
      setError(t('form.noDenoms'));
      return;
    }
    setSaving(true);
    setError(null);
    const created = await window.api.tellerCurrencies.create({
      sessionId,
      code: code.trim(),
      name: name.trim() || undefined,
    });
    if (!created.ok) {
      setSaving(false);
      setError(tErrors(created.errorCode));
      return;
    }
    for (const value of values) {
      const denom = await window.api.tellerCurrencies.createDenomination({
        sessionId,
        currencyCode: created.data.currency.code,
        value,
      });
      if (!denom.ok) {
        setSaving(false);
        setError(tErrors(denom.errorCode));
        return;
      }
    }
    setSaving(false);
    setCode('');
    setName('');
    setDenoms('');
    onCreated(created.data.currency.code);
  }

  return (
    <form className="teller-currency-form" onSubmit={(event) => void handleSubmit(event)}>
      <p>{t('form.addCurrencyHint')}</p>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="teller-currency-form-grid">
        <label>
          <span>{t('form.currencyCode')}</span>
          <input value={code} onChange={(event) => setCode(event.target.value)} maxLength={5} required />
        </label>
        <label>
          <span>{t('form.currencyName')}</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="teller-currency-form-denoms">
          <span>{t('form.denominations')}</span>
          <input
            value={denoms}
            onChange={(event) => setDenoms(event.target.value)}
            placeholder={t('form.denominationsHint')}
            required
          />
        </label>
      </div>
      <button type="submit" className="teller-sheet-tab" disabled={saving}>
        {t('form.saveCurrency')}
      </button>
    </form>
  );
}
