export const ZERO_BALANCE = '0.0000';

export type MoneySign = 'positive' | 'negative' | 'zero';

/** Visual sign only — does not change stored balances or calculations. */
export function getMoneySign(amount: string): MoneySign {
  const value = Number.parseFloat(amount);
  if (!Number.isFinite(value) || value === 0) {
    return 'zero';
  }
  return value > 0 ? 'positive' : 'negative';
}

export function formatMoneyDisplay(amount: string, fractionDigits = 2): string {
  const negative = amount.startsWith('-');
  const unsigned = negative ? amount.slice(1) : amount;
  const [wholeRaw, fractionRaw = ''] = unsigned.split('.');
  const fraction = `${fractionRaw}${'0'.repeat(fractionDigits)}`.slice(0, fractionDigits);
  const grouped = (wholeRaw && wholeRaw.length > 0 ? wholeRaw : '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = negative ? '-' : '';
  return fractionDigits > 0 ? `${sign}${grouped}.${fraction}` : `${sign}${grouped}`;
}
