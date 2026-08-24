import { amountsEqual, calculateDenominationTotal, subtractTellerAmounts } from '@shared/teller/denominationMath';
import type { TellerDenomination } from '@shared/types/teller';
import { ZERO_BALANCE } from '@shared/money';
import { useLocaleFormat } from '../../../hooks/useLocaleFormat';
import { useTranslation } from 'react-i18next';

interface DenominationGridProps {
  denominations: TellerDenomination[];
  quantities: Record<number, string>;
  onChange: (denominationId: number, value: string) => void;
  available?: Record<number, number>;
  declaredAmount?: string | null;
  disabled?: boolean;
}

export function parseQuantityField(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  return Number.parseInt(trimmed, 10);
}

export function quantitiesFromFields(
  denominations: TellerDenomination[],
  fields: Record<number, string>,
): Array<{ denominationId: number; unitValue: string; quantity: number }> | null {
  const lines: Array<{ denominationId: number; unitValue: string; quantity: number }> = [];
  for (const denom of denominations) {
    const parsed = parseQuantityField(fields[denom.id] ?? '');
    if (parsed === null) {
      return null;
    }
    lines.push({ denominationId: denom.id, unitValue: denom.value, quantity: parsed });
  }
  return lines;
}

export function DenominationGrid({
  denominations,
  quantities,
  onChange,
  available,
  declaredAmount,
  disabled = false,
}: DenominationGridProps): JSX.Element {
  const { t } = useTranslation('teller');
  const { formatMoney } = useLocaleFormat();
  const lines = quantitiesFromFields(denominations, quantities);
  const calc = lines ? calculateDenominationTotal(lines) : null;
  const calculated = calc?.ok ? calc.total : ZERO_BALANCE;
  const hasDeclared = Boolean(declaredAmount && declaredAmount.trim().length > 0);
  const matched = hasDeclared && calc?.ok ? amountsEqual(declaredAmount ?? '', calculated) : calc?.ok === true;
  const difference = hasDeclared && calc?.ok ? subtractTellerAmounts(declaredAmount ?? ZERO_BALANCE, calculated) : ZERO_BALANCE;

  return (
    <div className="teller-denom-wrap">
      <div className="teller-denom-status">
        <div>
          <span>{t('form.calculated')}</span>
          <strong>{calc?.ok ? formatMoney(calc.total) : '—'}</strong>
        </div>
        {hasDeclared ? (
          matched ? (
            <p className="teller-match is-ok">{t('form.amountVerified')}</p>
          ) : (
            <p className="teller-match is-warn">
              {t('form.amountMismatch')}
              <span>
                {t('form.enteredAmount')}: {formatMoney(declaredAmount ?? ZERO_BALANCE)}
              </span>
              <span>
                {t('form.calculated')}: {formatMoney(calculated)}
              </span>
              <span>
                {t('form.difference')}: {formatMoney(difference)}
              </span>
            </p>
          )
        ) : null}
      </div>
      <table className="customer-table teller-denom-table">
        <thead>
          <tr>
            <th>{t('form.value')}</th>
            <th>{t('form.quantity')}</th>
            {available ? <th>{t('form.available')}</th> : null}
            <th>{t('form.lineTotal')}</th>
          </tr>
        </thead>
        <tbody>
          {denominations.map((denom) => {
            const qty = parseQuantityField(quantities[denom.id] ?? '') ?? 0;
            const line = calculateDenominationTotal([
              { denominationId: denom.id, unitValue: denom.value, quantity: Number.isInteger(qty) ? qty : 0 },
            ]);
            const shortage = available !== undefined && qty > (available[denom.id] ?? 0);
            return (
              <tr key={denom.id} className={shortage ? 'teller-denom-shortage' : undefined}>
                <td>{formatMoney(denom.value)}</td>
                <td>
                  <input
                    className="teller-qty-input"
                    inputMode="numeric"
                    autoComplete="off"
                    disabled={disabled}
                    value={quantities[denom.id] ?? ''}
                    onChange={(event) => onChange(denom.id, event.target.value.replace(/[^\d]/g, ''))}
                    aria-label={`${denom.value}`}
                  />
                </td>
                {available ? <td>{available[denom.id] ?? 0}</td> : null}
                <td className="numeric">{line.ok ? formatMoney(line.lines[0]?.lineTotal ?? ZERO_BALANCE) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="teller-denom-total">
        <span>{t('form.calculated')}</span>
        <strong>{calc?.ok ? formatMoney(calc.total) : '—'}</strong>
      </div>
    </div>
  );
}
