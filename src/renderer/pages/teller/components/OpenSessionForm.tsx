import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Currency } from '@shared/types/currency';
import type { TellerDenomination } from '@shared/types/teller';
import { useAuth } from '../../../context/AuthContext';
import { DenominationGrid } from './DenominationGrid';
import { currencyLabel } from './TellerCurrencySelect';

interface OpenSessionFormProps {
  currencies?: Currency[];
  onOpened: () => void;
}

export function OpenSessionForm({ currencies = [], onOpened }: OpenSessionFormProps): JSX.Element {
  const { t } = useTranslation('teller');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const { sessionId } = useAuth();
  const [denoms, setDenoms] = useState<TellerDenomination[]>([]);
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    void window.api.teller.listDenominations({ sessionId }).then((result) => {
      if (result.ok) {
        setDenoms(result.data.denominations);
      }
    });
  }, [sessionId]);

  const groups = useMemo(() => {
    const byCode = new Map<string, TellerDenomination[]>();
    for (const denom of denoms) {
      const current = byCode.get(denom.currencyCode) ?? [];
      current.push(denom);
      byCode.set(denom.currencyCode, current);
    }
    const ordered = currencies.length > 0 ? currencies.map((item) => item.code) : [...byCode.keys()];
    return ordered
      .filter((code) => (byCode.get(code) ?? []).length > 0)
      .map((code) => ({
        code,
        label: currencyLabel(
          currencies.find((item) => item.code === code) ?? {
            code,
            nameKey: `currency.${code.toLowerCase()}`,
            displayName: code,
            symbol: '',
            isActive: true,
            sortOrder: 0,
            hasTransactions: false,
          },
          tCommon,
        ),
        denoms: byCode.get(code) ?? [],
      }));
  }, [currencies, denoms, tCommon]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!sessionId || isSubmitting) {
      return;
    }
    setError(null);
    const openingQuantities = Object.entries(quantities)
      .map(([id, value]) => ({ denominationId: Number(id), quantity: value.trim() === '' ? 0 : Number.parseInt(value, 10) }))
      .filter((line) => Number.isInteger(line.quantity) && line.quantity >= 0);

    setIsSubmitting(true);
    const result = await window.api.teller.openSession({
      sessionId,
      note,
      openingQuantities,
    });
    setIsSubmitting(false);
    if (!result.ok) {
      setError(tErrors(result.errorCode));
      return;
    }
    onOpened();
  }

  return (
    <form className="teller-form" onSubmit={(event) => void handleSubmit(event)}>
      <p className="hint-text">{t('session.openingHint')}</p>
      {error ? <p className="form-error">{error}</p> : null}
      {groups.map((group) => (
        <section key={group.code}>
          <h3>
            {t('session.openingCash')} · {group.label}
          </h3>
          <DenominationGrid
            denominations={group.denoms}
            quantities={quantities}
            onChange={(id, value) => setQuantities((current) => ({ ...current, [id]: value }))}
            disabled={isSubmitting}
          />
        </section>
      ))}
      <label className="form-field">
        <span>{t('session.note')}</span>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} />
      </label>
      <button type="submit" className="button button-primary" disabled={isSubmitting}>
        {t('session.open')}
      </button>
    </form>
  );
}
