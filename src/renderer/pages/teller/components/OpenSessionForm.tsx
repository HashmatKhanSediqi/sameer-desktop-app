import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TellerDenomination } from '@shared/types/teller';
import { useAuth } from '../../../context/AuthContext';
import { parsePieceInput } from '../tellerDisplay';

interface OpenSessionFormProps {
  currencyCode: string;
  onOpened: () => void;
}

export function OpenSessionForm({ currencyCode, onOpened }: OpenSessionFormProps): JSX.Element {
  const { t } = useTranslation('teller');
  const { t: tErrors } = useTranslation('errors');
  const { sessionId } = useAuth();
  const [denoms, setDenoms] = useState<TellerDenomination[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [branchName, setBranchName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!sessionId || !currencyCode) {
      return;
    }
    void window.api.teller.listDenominations({ sessionId, currencyCode }).then((result) => {
      if (result.ok) {
        setDenoms(result.data.denominations);
        setQuantities({});
      }
    });
  }, [sessionId, currencyCode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!sessionId || isSubmitting) {
      return;
    }
    setError(null);
    const openingCounts: Record<string, number> = {};
    for (const denom of denoms) {
      openingCounts[denom.value] = parsePieceInput(quantities[denom.value] ?? '');
    }

    setIsSubmitting(true);
    const result = await window.api.teller.openSession({
      sessionId,
      currencyCode,
      sessionDate,
      branchName: branchName.trim() || null,
      branchCode: branchCode.trim() || null,
      openingCounts,
      note,
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
      <p className="hint-text">{t('session.noneHint')}</p>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="teller-form-grid">
        <label className="form-field">
          <span>{t('session.sessionDate')}</span>
          <input type="date" value={sessionDate} onChange={(event) => setSessionDate(event.target.value)} />
        </label>
        <label className="form-field">
          <span>{t('session.branchName')}</span>
          <input value={branchName} onChange={(event) => setBranchName(event.target.value)} />
        </label>
        <label className="form-field">
          <span>{t('session.branchCode')}</span>
          <input value={branchCode} onChange={(event) => setBranchCode(event.target.value)} />
        </label>
      </div>
      <fieldset className="teller-ht-fieldset">
        <legend>{t('session.headTeller')}</legend>
        {denoms.length === 0 ? (
          <p className="empty-state">{t('form.noDenoms')}</p>
        ) : (
          <div className="teller-ht-grid">
            {denoms.map((denom) => (
              <label key={denom.id} className="form-field">
                <span>{denom.value}</span>
                <input
                  className="teller-input-pieces"
                  inputMode="numeric"
                  value={quantities[denom.value] ?? ''}
                  onChange={(event) =>
                    setQuantities((current) => ({ ...current, [denom.value]: event.target.value }))
                  }
                />
              </label>
            ))}
          </div>
        )}
      </fieldset>
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
