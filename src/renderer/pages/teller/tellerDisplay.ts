import { amountsEqual, formatTellerPlainAmount } from '@shared/teller/denominationMath';
import { ZERO_BALANCE } from '@shared/money';

export { formatTellerPlainAmount };

export function formatTellerMoney(
  formatMoney: (amount: string, fractionDigits?: number) => string,
  amount: string | null | undefined,
): string {
  if (amount === null || amount === undefined || amount.trim().length === 0) {
    return '';
  }
  if (amountsEqual(amount, ZERO_BALANCE) || amountsEqual(amount, '0')) {
    return '—';
  }
  const plain = formatTellerPlainAmount(amount);
  const fractionDigits = plain.includes('.') ? plain.split('.')[1]!.length : 0;
  return formatMoney(plain, fractionDigits);
}

export function formatTellerPieces(value: number): string {
  if (value === 0) {
    return '—';
  }
  return String(value);
}

export function parsePieceInput(value: string): number {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}
