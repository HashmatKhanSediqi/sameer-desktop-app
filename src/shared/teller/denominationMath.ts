import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export const TELLER_AMOUNT_SCALE = 4;

export type DenominationMathError =
  | 'NEGATIVE_QUANTITY'
  | 'NON_INTEGER_QUANTITY'
  | 'INVALID_VALUE'
  | 'EMPTY_LINES';

export interface DenominationQuantityInput {
  denominationId: number;
  unitValue: string;
  quantity: number;
}

export interface DenominationLineTotal {
  denominationId: number;
  unitValue: string;
  quantity: number;
  lineTotal: string;
}

export type DenominationCalcResult =
  | { ok: true; total: string; lines: DenominationLineTotal[] }
  | { ok: false; error: DenominationMathError };

function isValidUnitValue(value: string): boolean {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }
  try {
    const parsed = new Decimal(value.trim());
    return parsed.isFinite() && parsed.gt(0) && parsed.decimalPlaces() <= TELLER_AMOUNT_SCALE;
  } catch {
    return false;
  }
}

export function formatTellerAmount(value: Decimal): string {
  return value.toFixed(TELLER_AMOUNT_SCALE);
}

export function formatTellerPlainAmount(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return '';
  }
  try {
    const parsed = new Decimal(trimmed);
    if (!parsed.isFinite()) {
      return trimmed;
    }
    const places = parsed.decimalPlaces();
    return places === 0 ? parsed.toFixed(0) : parsed.toFixed(places);
  } catch {
    return trimmed;
  }
}

export function parseTellerDecimal(value: string): Decimal {
  return new Decimal(value);
}

export function calculateDenominationTotal(
  inputs: readonly DenominationQuantityInput[],
): DenominationCalcResult {
  const lines: DenominationLineTotal[] = [];
  let total = new Decimal(0);

  for (const input of inputs) {
    if (!Number.isInteger(input.quantity)) {
      return { ok: false, error: 'NON_INTEGER_QUANTITY' };
    }
    if (input.quantity < 0) {
      return { ok: false, error: 'NEGATIVE_QUANTITY' };
    }
    if (!isValidUnitValue(input.unitValue)) {
      return { ok: false, error: 'INVALID_VALUE' };
    }
    if (input.quantity === 0) {
      continue;
    }

    const unit = new Decimal(input.unitValue.trim());
    const lineTotal = unit.times(input.quantity);
    lines.push({
      denominationId: input.denominationId,
      unitValue: formatTellerAmount(unit),
      quantity: input.quantity,
      lineTotal: formatTellerAmount(lineTotal),
    });
    total = total.plus(lineTotal);
  }

  return { ok: true, total: formatTellerAmount(total), lines };
}

export function amountsEqual(left: string, right: string): boolean {
  try {
    return new Decimal(left).eq(new Decimal(right));
  } catch {
    return false;
  }
}

export function addTellerAmounts(left: string, right: string): string {
  return formatTellerAmount(new Decimal(left).plus(new Decimal(right)));
}

export function subtractTellerAmounts(left: string, right: string): string {
  return formatTellerAmount(new Decimal(left).minus(new Decimal(right)));
}

export function remainingPieces(received: number, paid: number): number {
  return received - paid;
}

export function remainingAmount(pieces: number, unitValue: string): string {
  return formatTellerAmount(new Decimal(unitValue).times(pieces));
}
