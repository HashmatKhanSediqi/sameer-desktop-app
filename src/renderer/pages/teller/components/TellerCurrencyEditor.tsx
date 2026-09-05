import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CurrencyDenomination } from '@shared/types/currency';
import { useAuth } from '../../../context/AuthContext';

interface TellerCurrencyEditorProps {
  currencyCode: string;
  onChanged: () => void;
  onClose: () => void;
}

export function TellerCurrencyEditor({ currencyCode, onChanged, onClose }: TellerCurrencyEditorProps): JSX.Element {
  const { t } = useTranslation('teller');
  const { t: tErrors } = useTranslation('errors');
  const { sessionId } = useAuth();
  const [items, setItems] = useState<CurrencyDenomination[]>([]);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    if (!sessionId) return;
    const result = await window.api.tellerCurrencies.listDenominations({ sessionId, currencyCode, includeInactive: true });
    if (result.ok) setItems(result.data.denominations);
    else setError(tErrors(result.errorCode));
  }

  useEffect(() => {
    void load();
  }, [currencyCode, sessionId]);

  async function add(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!sessionId || !value.trim() || busy) return;
    setBusy(true);
    setError(null);
    const result = await window.api.tellerCurrencies.createDenomination({ sessionId, currencyCode, value: value.trim() });
    setBusy(false);
    if (!result.ok) {
      setError(tErrors(result.errorCode));
      return;
    }
    setValue('');
    await load();
    onChanged();
  }

  async function toggle(item: CurrencyDenomination): Promise<void> {
    if (!sessionId || busy) return;
    setBusy(true);
    setError(null);
    const result = item.isActive
      ? await window.api.tellerCurrencies.deactivateDenomination({ sessionId, id: item.id })
      : await window.api.tellerCurrencies.reactivateDenomination({ sessionId, id: item.id });
    setBusy(false);
    if (!result.ok) {
      setError(tErrors(result.errorCode));
      return;
    }
    await load();
    onChanged();
  }

  return (
    <section className="teller-currency-editor" aria-label={t('form.editCurrency')}>
      <div className="teller-currency-editor-title">
        <strong>{t('form.editCurrencyLabel', { currency: currencyCode })}</strong>
        <button type="button" className="button button-secondary button-compact" onClick={onClose}>{t('form.closeEditor')}</button>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="teller-currency-editor-list">
        {items.map((item) => (
          <div key={item.id} className={item.isActive ? 'teller-denomination-chip' : 'teller-denomination-chip is-inactive'}>
            <span>{item.value}</span>
            <button type="button" disabled={busy} onClick={() => void toggle(item)}>
              {item.isActive ? t('form.retireDenomination') : t('form.restoreDenomination')}
            </button>
            {item.inUse ? <small title={t('form.historicalDenomination')}>{t('form.inUse')}</small> : null}
          </div>
        ))}
      </div>
      <form className="teller-currency-editor-add" onSubmit={(event) => void add(event)}>
        <label>
          <span>{t('form.denominationValue')}</span>
          <input value={value} inputMode="decimal" onChange={(event) => setValue(event.target.value)} disabled={busy} />
        </label>
        <button type="submit" className="button button-primary button-compact" disabled={busy || !value.trim()}>{t('form.addDenomination')}</button>
      </form>
    </section>
  );
}
