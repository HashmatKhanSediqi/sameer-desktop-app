import { AppError } from '../../utils/errors';
import type { TellerDenominationQuantityInput, TellerTransactionTypeCode } from '@shared/types/teller';
import {
  parseOptionalNote,
  parsePositiveIntegerId,
  parseTransactionDate,
} from '../transaction/transactionValidation';
import Decimal from 'decimal.js';

const AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/;
const TYPE_CODES: readonly TellerTransactionTypeCode[] = [
  'CUSTOMER_CASH_IN',
  'CUSTOMER_CASH_OUT',
  'HEAD_TELLER_IN',
  'HEAD_TELLER_OUT',
  'INTERNAL_TRANSFER_IN',
  'INTERNAL_TRANSFER_OUT',
  'OPENING_BALANCE',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
];

export function parseTellerTypeCode(value: unknown): TellerTransactionTypeCode {
  if (typeof value !== 'string' || !TYPE_CODES.includes(value as TellerTransactionTypeCode)) {
    throw new AppError('INVALID_TRANSACTION_TYPE', 'INVALID_TRANSACTION_TYPE');
  }
  return value as TellerTransactionTypeCode;
}

export function parseOptionalTellerAmount(value: unknown): string | undefined {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0)) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'AMOUNT_INVALID');
  }
  const trimmed = value.trim();
  if (!AMOUNT_PATTERN.test(trimmed)) {
    throw new AppError('VALIDATION_ERROR', 'AMOUNT_INVALID');
  }
  const amount = new Decimal(trimmed);
  if (!amount.isFinite() || amount.lt(0) || amount.decimalPlaces() > 4) {
    throw new AppError('VALIDATION_ERROR', 'AMOUNT_INVALID');
  }
  return trimmed;
}

export function parseQuantityList(value: unknown): TellerDenominationQuantityInput[] {
  if (!Array.isArray(value)) {
    throw new AppError('TELLER_DENOMINATION_INVALID', 'TELLER_DENOMINATION_INVALID');
  }

  const seen = new Set<number>();
  const quantities: TellerDenominationQuantityInput[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      throw new AppError('TELLER_DENOMINATION_INVALID', 'TELLER_DENOMINATION_INVALID');
    }
    const record = item as Record<string, unknown>;
    const denominationId = parsePositiveIntegerId(record.denominationId, 'TELLER_DENOMINATION_INVALID');
    if (typeof record.quantity !== 'number' || !Number.isInteger(record.quantity)) {
      throw new AppError('TELLER_DENOMINATION_INVALID', 'NON_INTEGER_QUANTITY');
    }
    if (record.quantity < 0) {
      throw new AppError('TELLER_DENOMINATION_INVALID', 'NEGATIVE_QUANTITY');
    }
    if (seen.has(denominationId)) {
      throw new AppError('TELLER_DENOMINATION_INVALID', 'TELLER_DENOMINATION_INVALID');
    }
    seen.add(denominationId);
    quantities.push({ denominationId, quantity: record.quantity });
  }

  return quantities;
}

export function parseOptionalSessionId(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return parsePositiveIntegerId(value, 'TELLER_SESSION_NOT_FOUND');
}

export { parseOptionalNote, parsePositiveIntegerId, parseTransactionDate };
