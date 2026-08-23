import { describe, expect, it } from 'vitest';
import { convertCurrency } from '../../src/shared/exchange';

describe('convertCurrency', () => {
  it('converts using Decimal.js without floating-point drift', () => {
    const result = convertCurrency({
      amount: '100',
      rate: '70',
      fromCurrency: 'usd',
      toCurrency: 'afn',
    });
    expect(result.result).toBe('7000.0000');
    expect(result.fromCurrency).toBe('USD');
    expect(result.toCurrency).toBe('AFN');

    expect(
      convertCurrency({
        amount: '10.125',
        rate: '0.3333',
        fromCurrency: 'EUR',
        toCurrency: 'USD',
      }).result,
    ).toBe('3.3747');
  });

  it('rejects invalid amount, rate, and identical currencies', () => {
    expect(() =>
      convertCurrency({ amount: '-1', rate: '70', fromCurrency: 'USD', toCurrency: 'AFN' }),
    ).toThrowError(/EXCHANGE_AMOUNT_INVALID/);
    expect(() =>
      convertCurrency({ amount: '10', rate: '0', fromCurrency: 'USD', toCurrency: 'AFN' }),
    ).toThrowError(/EXCHANGE_RATE_INVALID/);
    expect(() =>
      convertCurrency({ amount: '10', rate: '2', fromCurrency: 'USD', toCurrency: 'USD' }),
    ).toThrowError(/EXCHANGE_SAME_CURRENCY/);
  });
});
