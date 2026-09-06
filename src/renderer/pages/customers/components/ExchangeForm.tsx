import { FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sanitizeAmountInput } from '@shared/amountInput';
import { calculateFromAmount, calculateToAmount } from '@shared/exchange';
import type { Currency } from '@shared/types/currency';
import type { CurrencySummary } from '@shared/types/transaction';
import { useAuth } from '../../../context/AuthContext';
import { useLocaleFormat } from '../../../hooks/useLocaleFormat';
import { ConfirmDialog } from './ConfirmDialog';

export function ExchangeForm({ customerId, currencies, summaries, onCancel, onSaved }: {
  customerId: number; currencies: Currency[]; summaries: CurrencySummary[];
  onCancel: () => void; onSaved: () => void;
}): JSX.Element {
  const { t } = useTranslation('transactions');
  const { t: te } = useTranslation('errors');
  const { sessionId } = useAuth();
  const { formatMoney } = useLocaleFormat();
  const [fromCurrency, setFromCurrency] = useState(currencies[0]?.code ?? '');
  const [toCurrency, setToCurrency] = useState(currencies.find((c) => c.code !== currencies[0]?.code)?.code ?? '');
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [rate, setRate] = useState('');
  const [driver, setDriver] = useState<'FROM' | 'TO'>('FROM');
  const [commissionAmount, setCommissionAmount] = useState('');
  const [commissionCurrency, setCommissionCurrency] = useState(currencies[0]?.code ?? '');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const calculated = useMemo(() => {
    try {
      if (!rate) return null;
      return driver === 'FROM' && fromAmount ? calculateToAmount(fromAmount, rate)
        : driver === 'TO' && toAmount ? calculateFromAmount(toAmount, rate) : null;
    } catch { return null; }
  }, [driver, fromAmount, toAmount, rate]);
  const finalFrom = driver === 'TO' ? calculated ?? '' : fromAmount;
  const finalTo = driver === 'FROM' ? calculated ?? '' : toAmount;
  const summary = `${formatMoney(finalFrom || '0')} ${fromCurrency} → ${formatMoney(finalTo || '0')} ${toCurrency}`;

  function submit(e: FormEvent): void {
    e.preventDefault(); setError(null);
    if (!finalFrom || !finalTo || fromCurrency === toCurrency) { setError(t('exchange.invalid')); return; }
    setConfirming(true);
  }
  async function confirm(): Promise<void> {
    if (!sessionId || busy) return;
    setBusy(true); setError(null);
    const result = await window.api.transactions.exchange({ sessionId, customerId, fromCurrency,
      fromAmount: finalFrom, toCurrency, toAmount: finalTo, rate,
      commissionAmount: commissionAmount || null,
      commissionCurrency: commissionAmount ? commissionCurrency : null, note: note || null,
      requestId: crypto.randomUUID() });
    setBusy(false);
    if (!result.ok) {
      setConfirming(false);
      const balanceParts = result.errorCode === 'INSUFFICIENT_BALANCE' ? result.message?.split(':') : null;
      setError(balanceParts?.length === 3
        ? t('exchange.insufficient', { available: formatMoney(balanceParts[1]!), requested: formatMoney(balanceParts[2]!), currency: fromCurrency })
        : te(result.errorCode) || t(`errors.${result.message}` as never));
      return;
    }
    onSaved();
  }
  const option = (currency: Currency) => `${currency.code} — ${t('exchange.balance')}: ${formatMoney(summaries.find((s) => s.currencyCode === currency.code)?.balance ?? '0')}`;
  return <div className="modal-backdrop"><div className="transaction-modal exchange-modal" role="dialog" aria-modal="true" aria-labelledby="exchange-title">
    <div className="transaction-modal-header"><h2 id="exchange-title">{t('exchange.title')}</h2></div>
    <form className="transaction-form" onSubmit={submit}><div className="transaction-modal-body exchange-form-grid">
      {error ? <div className="banner banner-error" role="alert">{error}</div> : null}
      <label className="form-field"><span>{t('exchange.fromCurrency')}</span><select value={fromCurrency} onChange={(e) => { setFromCurrency(e.target.value); if (commissionCurrency !== toCurrency) setCommissionCurrency(e.target.value); }} disabled={busy}>{currencies.map(c => <option key={c.code} value={c.code}>{option(c)}</option>)}</select></label>
      <label className="form-field amount-field"><span>{t('exchange.fromAmount')}</span><input dir="ltr" inputMode="decimal" value={driver === 'TO' ? finalFrom : fromAmount} onChange={(e) => { setDriver('FROM'); setFromAmount(sanitizeAmountInput(e.target.value)); }} disabled={busy}/></label>
      <label className="form-field"><span>{t('exchange.toCurrency')}</span><select value={toCurrency} onChange={(e) => setToCurrency(e.target.value)} disabled={busy}>{currencies.filter(c => c.code !== fromCurrency).map(c => <option key={c.code} value={c.code}>{c.code}</option>)}</select></label>
      <label className="form-field"><span>{t('exchange.rateConvention', { to: toCurrency, from: fromCurrency })}</span><input dir="ltr" inputMode="decimal" value={rate} onChange={(e) => setRate(sanitizeAmountInput(e.target.value))} disabled={busy}/></label>
      <label className="form-field amount-field"><span>{t('exchange.toAmount')}</span><input dir="ltr" inputMode="decimal" value={driver === 'FROM' ? finalTo : toAmount} onChange={(e) => { setDriver('TO'); setToAmount(sanitizeAmountInput(e.target.value)); }} disabled={busy}/></label>
      <div className="exchange-commission"><label className="form-field"><span>{t('exchange.commissionCurrency')}</span><select value={commissionCurrency} onChange={(e) => setCommissionCurrency(e.target.value)}><option value={fromCurrency}>{fromCurrency}</option><option value={toCurrency}>{toCurrency}</option></select></label><label className="form-field"><span>{t('exchange.commissionAmount')}</span><input dir="ltr" inputMode="decimal" value={commissionAmount} onChange={(e) => setCommissionAmount(sanitizeAmountInput(e.target.value))}/></label></div>
      <label className="form-field"><span>{t('note')}</span><textarea value={note} onChange={(e) => setNote(e.target.value)}/></label>
      <div className="exchange-preview" aria-live="polite"><strong>{t('exchange.preview')}</strong><span dir="ltr">{summary}</span><span>{t('exchange.businessSummary', { toAmount: finalTo || '—', to: toCurrency, fromAmount: finalFrom || '—', from: fromCurrency, rate: rate || '—' })}</span>{commissionAmount ? <span>{t('exchange.commissionSummary', { amount: commissionAmount, currency: commissionCurrency })}</span> : null}</div>
    </div><div className="transaction-modal-footer"><button type="button" className="button button-secondary" onClick={onCancel}>{t('cancel')}</button><button type="submit" className="button button-primary" disabled={busy}>{t('exchange.confirm')}</button></div></form>
    {confirming ? <ConfirmDialog title={t('exchange.confirmTitle')} message={summary} isBusy={busy} onCancel={() => setConfirming(false)} onConfirm={() => void confirm()}/> : null}
  </div></div>;
}
