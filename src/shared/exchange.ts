import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type ExchangeErrorCode =
  | 'EXCHANGE_AMOUNT_INVALID'
  | 'EXCHANGE_RATE_INVALID'
  | 'EXCHANGE_CURRENCY_REQUIRED'
  | 'EXCHANGE_SAME_CURRENCY';

export interface ExchangeConvertInput {
  amount: string;
  rate: string;
  fromCurrency: string;
  toCurrency: string;
}

export interface ExchangeConvertResult {
  amount: string;
  rate: string;
  fromCurrency: string;
  toCurrency: string;
  result: string;
}

const AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/;

export function convertCurrency(input: ExchangeConvertInput): ExchangeConvertResult {
  const fromCurrency = parseCurrency(input.fromCurrency);
  const toCurrency = parseCurrency(input.toCurrency);
  if (fromCurrency === toCurrency) {
    throw exchangeError('EXCHANGE_SAME_CURRENCY');
  }

  const amount = parsePositiveDecimal(input.amount, 'EXCHANGE_AMOUNT_INVALID');
  const rate = parsePositiveDecimal(input.rate, 'EXCHANGE_RATE_INVALID');

  return {
    amount: amount.toFixed(),
    rate: rate.toFixed(),
    fromCurrency,
    toCurrency,
    result: amount.times(rate).toFixed(4, Decimal.ROUND_HALF_UP),
  };
}

function parseCurrency(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw exchangeError('EXCHANGE_CURRENCY_REQUIRED');
  }
  return value.trim().toUpperCase();
}

function parsePositiveDecimal(value: unknown, code: ExchangeErrorCode): Decimal {
  if (typeof value !== 'string' || !AMOUNT_PATTERN.test(value.trim())) {
    throw exchangeError(code);
  }
  const decimal = new Decimal(value.trim());
  if (!decimal.isFinite() || decimal.lte(0) || decimal.decimalPlaces() > 4) {
    throw exchangeError(code);
  }
  return decimal;
}

function exchangeError(code: ExchangeErrorCode): Error & { code: ExchangeErrorCode } {
  const error = new Error(code) as Error & { code: ExchangeErrorCode };
  error.code = code;
  return error;
}
