import { describe, expect, it } from 'vitest';
import {
  amountsEqual,
  calculateDenominationTotal,
  formatTellerPlainAmount,
  remainingAmount,
  remainingPieces,
} from '../../src/shared/teller/denominationMath';

describe('teller denomination math', () => {
  it('calculates AFN mixed denominations', () => {
    const result = calculateDenominationTotal([
      { denominationId: 1, unitValue: '1000', quantity: 3 },
      { denominationId: 2, unitValue: '500', quantity: 1 },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.total).toBe('3500.0000');
    }
  });

  it('calculates USD mixed denominations', () => {
    const result = calculateDenominationTotal([
      { denominationId: 10, unitValue: '100', quantity: 2 },
      { denominationId: 11, unitValue: '20', quantity: 1 },
      { denominationId: 12, unitValue: '5', quantity: 3 },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.total).toBe('235.0000');
    }
  });

  it('ignores zero quantities', () => {
    const result = calculateDenominationTotal([
      { denominationId: 1, unitValue: '1000', quantity: 0 },
      { denominationId: 2, unitValue: '500', quantity: 2 },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.total).toBe('1000.0000');
      expect(result.lines).toHaveLength(1);
    }
  });

  it('rejects negative quantities', () => {
    const result = calculateDenominationTotal([{ denominationId: 1, unitValue: '1000', quantity: -1 }]);
    expect(result).toEqual({ ok: false, error: 'NEGATIVE_QUANTITY' });
  });

  it('rejects non-integer quantities', () => {
    const result = calculateDenominationTotal([{ denominationId: 1, unitValue: '1000', quantity: 1.5 }]);
    expect(result).toEqual({ ok: false, error: 'NON_INTEGER_QUANTITY' });
  });

  it('detects amount mismatch', () => {
    const result = calculateDenominationTotal([{ denominationId: 1, unitValue: '1000', quantity: 3 }]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(amountsEqual(result.total, '3500')).toBe(false);
      expect(amountsEqual(result.total, '3000')).toBe(true);
    }
  });

  it('computes remaining pieces and amount', () => {
    expect(remainingPieces(10, 4)).toBe(6);
    expect(remainingAmount(3, '500')).toBe('1500.0000');
  });

  it('calculates mixed currencies including fractional coins with the same engine', () => {
    const euro = calculateDenominationTotal([
      { denominationId: 21, unitValue: '50', quantity: 2 },
      { denominationId: 22, unitValue: '0.50', quantity: 3 },
      { denominationId: 23, unitValue: '0.02', quantity: 4 },
    ]);
    expect(euro.ok).toBe(true);
    if (euro.ok) {
      expect(euro.total).toBe('101.5800');
    }

    const yen = calculateDenominationTotal([
      { denominationId: 31, unitValue: '10000', quantity: 1 },
      { denominationId: 32, unitValue: '500', quantity: 2 },
    ]);
    expect(yen.ok).toBe(true);
    if (yen.ok) {
      expect(yen.total).toBe('11000.0000');
    }
  });

  it('displays whole teller amounts without trailing zeros and keeps meaningful decimals', () => {
    expect(formatTellerPlainAmount('3000.0000')).toBe('3000');
    expect(formatTellerPlainAmount('150')).toBe('150');
    expect(formatTellerPlainAmount('3000.5')).toBe('3000.5');
    expect(formatTellerPlainAmount('3000.2500')).toBe('3000.25');
    expect(formatTellerPlainAmount('')).toBe('');
  });
});
