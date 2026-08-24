import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TellerDenomination } from '@shared/types/teller';
import { useAuth } from '../../../context/AuthContext';
import { DenominationGrid } from './DenominationGrid';

interface OpenSessionFormProps {
  onOpened: () => void;
}

export function OpenSessionForm({ onOpened }: OpenSessionFormProps): JSX.Element {
  const { t } = useTranslation('teller');
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

  const afn = denoms.filter((item) => item.currencyCode === 'AFN');
  const usd = denoms.filter((item) => item.currencyCode === 'USD');

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!sessionId || isSubmitting) {
      return;
    }
    setError(null);
    const openingQuantities = Object.entries(quantities)
      .map(([id, value]) => ({ denominationId: Number(id), quantity: value.trim() === '' ? 0 : Number.parseInt(value, 10) }))
      .filter((line) => Number.isInteger(line.quantity) && line.quantity >= 0);

    if (openingQuantities.some((line) => !Number.isInteger(line.quantity))) {
      setError(tErrors('TELLER_DENOMINATION_INVALID'));
      return;
    }

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
      <h3>{t('session.openingCash')} · AFN</h3>
      <DenominationGrid
        denominations={afn}
        quantities={quantities}
        onChange={(id, value) => setQuantities((current) => ({ ...current, [id]: value }))}
        disabled={isSubmitting}
      />
      <h3>{t('session.openingCash')} · USD</h3>
      <DenominationGrid
        denominations={usd}
        quantities={quantities}
        onChange={(id, value) => setQuantities((current) => ({ ...current, [id]: value }))}
        disabled={isSubmitting}
      />
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
