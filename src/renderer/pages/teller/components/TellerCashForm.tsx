import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { calculateDenominationTotal } from '@shared/teller/denominationMath';
import type { TellerDenomination, TellerTransactionTypeCode } from '@shared/types/teller';
import type { CustomerListItem } from '@shared/types/customer';
import { useAuth } from '../../../context/AuthContext';
import { DenominationGrid, quantitiesFromFields } from './DenominationGrid';

type PartyKind = 'CUSTOMER' | 'HEAD_TELLER';

interface TellerCashFormProps {
  mode: 'in' | 'out';
  onSaved: () => void;
}

export function TellerCashForm({ mode, onSaved }: TellerCashFormProps): JSX.Element {
  const { t } = useTranslation('teller');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const { sessionId } = useAuth();
  const [party, setParty] = useState<PartyKind>('CUSTOMER');
  const [currencyCode, setCurrencyCode] = useState('AFN');
  const [denominations, setDenominations] = useState<TellerDenomination[]>([]);
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [available, setAvailable] = useState<Record<number, number>>({});
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<CustomerListItem[]>([]);
  const [customer, setCustomer] = useState<CustomerListItem | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSession, setHasSession] = useState(true);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    void window.api.teller.currentSession({ sessionId }).then((result) => {
      if (result.ok) {
        setHasSession(result.data.session !== null);
      }
    });
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    void window.api.teller.listDenominations({ sessionId, currencyCode }).then((result) => {
      if (result.ok) {
        setDenominations(result.data.denominations);
        setQuantities({});
      }
    });
    if (mode === 'out') {
      void window.api.teller.getTally({ sessionId, currencyCode }).then((result) => {
        if (result.ok) {
          const next: Record<number, number> = {};
          for (const row of result.data.rows) {
            next[row.denominationId] = row.remainingPieces;
          }
          setAvailable(next);
        }
      });
    }
  }, [sessionId, currencyCode, mode]);

  useEffect(() => {
    if (!sessionId || party !== 'CUSTOMER' || customerQuery.trim().length < 1) {
      setCustomerResults([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void window.api.customers.search({
        sessionId,
        query: customerQuery,
        page: 1,
        pageSize: 8,
        includeAccounting: false,
      }).then((result) => {
        if (result.ok) {
          setCustomerResults(result.data.customers);
        }
      });
    }, 250);
    return () => window.clearTimeout(handle);
  }, [sessionId, customerQuery, party]);

  const calc = useMemo(() => {
    const lines = quantitiesFromFields(denominations, quantities);
    return lines ? calculateDenominationTotal(lines) : null;
  }, [denominations, quantities]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!sessionId || isSubmitting) {
      return;
    }
    setError(null);
    setSuccess(null);

    const lines = quantitiesFromFields(denominations, quantities);
    if (!lines) {
      setError(tErrors('TELLER_DENOMINATION_INVALID'));
      return;
    }
    const computed = calculateDenominationTotal(lines);
    if (!computed.ok) {
      setError(tErrors(computed.error));
      return;
    }

    const typeCode: TellerTransactionTypeCode =
      mode === 'in'
        ? party === 'CUSTOMER'
          ? 'CUSTOMER_CASH_IN'
          : 'HEAD_TELLER_IN'
        : party === 'CUSTOMER'
          ? 'CUSTOMER_CASH_OUT'
          : 'HEAD_TELLER_OUT';

    setIsSubmitting(true);
    const result = await window.api.teller.createTransaction({
      sessionId,
      typeCode,
      currencyCode,
      customerId: party === 'CUSTOMER' ? customer?.id ?? null : null,
      amount: computed.total,
      quantities: lines
        .filter((line) => line.quantity > 0)
        .map((line) => ({ denominationId: line.denominationId, quantity: line.quantity })),
      note,
    });
    setIsSubmitting(false);

    if (!result.ok) {
      setError(tErrors(result.errorCode));
      return;
    }

    setSuccess(mode === 'in' ? t('form.savedIn') : t('form.savedOut'));
    setQuantities({});
    setNote('');
    onSaved();
    if (mode === 'out' && sessionId) {
      void window.api.teller.getTally({ sessionId, currencyCode }).then((tally) => {
        if (tally.ok) {
          const next: Record<number, number> = {};
          for (const row of tally.data.rows) {
            next[row.denominationId] = row.remainingPieces;
          }
          setAvailable(next);
        }
      });
    }
  }

  if (!hasSession) {
    return <p className="empty-state">{t('session.noneHint')}</p>;
  }

  return (
    <form className="teller-form" onSubmit={(event) => void handleSubmit(event)}>
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <div className="teller-form-grid">
        <label className="form-field">
          <span>{t('form.party')}</span>
          <select value={party} onChange={(event) => setParty(event.target.value as PartyKind)}>
            <option value="CUSTOMER">{t('form.partyCustomer')}</option>
            <option value="HEAD_TELLER">{t('form.partyHeadTeller')}</option>
          </select>
        </label>
        <label className="form-field">
          <span>{t('form.currency')}</span>
          <select value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)}>
            <option value="AFN">AFN</option>
            <option value="USD">USD</option>
          </select>
        </label>
      </div>

      {party === 'HEAD_TELLER' ? <p className="hint-text">{t('form.headTellerHint')}</p> : null}

      {party === 'CUSTOMER' ? (
        <div className="form-field">
          <span>{t('form.customer')}</span>
          {customer ? (
            <div className="teller-customer-picked">
              <strong>{customer.name || tCommon('emptyValue')}</strong>
              <span>{customer.customerNumber || tCommon('emptyValue')}</span>
              <button type="button" className="button-link" onClick={() => setCustomer(null)}>
                {tCommon('cancel')}
              </button>
            </div>
          ) : (
            <>
              <input
                value={customerQuery}
                onChange={(event) => setCustomerQuery(event.target.value)}
                placeholder={t('form.customerSearch')}
                autoComplete="off"
              />
              {customerResults.length > 0 ? (
                <ul className="teller-customer-results">
                  {customerResults.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomer(item);
                          setCustomerQuery('');
                          setCustomerResults([]);
                        }}
                      >
                        {item.name || tCommon('emptyValue')} {item.customerNumber ? `· ${item.customerNumber}` : ''}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {denominations.length === 0 ? (
        <p className="empty-state">{t('form.noDenoms')}</p>
      ) : (
        <DenominationGrid
          denominations={denominations}
          quantities={quantities}
          available={mode === 'out' ? available : undefined}
          onChange={(id, value) => setQuantities((current) => ({ ...current, [id]: value }))}
          disabled={isSubmitting}
        />
      )}

      <label className="form-field">
        <span>{t('form.note')}</span>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} />
      </label>

      <div className="teller-form-actions">
        <button
          type="submit"
          className={mode === 'in' ? 'button button-cash-in' : 'button button-cash-out'}
          disabled={isSubmitting || !calc?.ok}
        >
          {mode === 'in' ? t('form.saveIn') : t('form.saveOut')}
        </button>
      </div>
    </form>
  );
}
