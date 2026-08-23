import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export const ZERO_BALANCE = '0.0000';

export function decimalFromAmount(amount: string): Decimal {
  return new Decimal(amount);
}

export function addAmounts(left: string, right: string): string {
  return new Decimal(left).plus(new Decimal(right)).toFixed(4);
}

export function subtractAmounts(left: string, right: string): string {
  return new Decimal(left).minus(new Decimal(right)).toFixed(4);
}

export function formatBalance(value: Decimal): string {
  return value.toFixed(4);
}

export function formatMoneyDisplay(amount: string, fractionDigits = 2): string {
  const value = new Decimal(amount);
  const negative = value.isNegative();
  const [whole, fraction = ''] = value.abs().toFixed(fractionDigits).split('.');
  const grouped = (whole ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = negative ? '-' : '';
  return fractionDigits > 0 ? `${sign}${grouped}.${fraction}` : `${sign}${grouped}`;
}
