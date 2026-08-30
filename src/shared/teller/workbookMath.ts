import {
  addTellerAmounts,
  amountsEqual,
  calculateDenominationTotal,
  formatTellerAmount,
  parseTellerDecimal,
  subtractTellerAmounts,
} from './denominationMath';

export const AFN_DENOMINATION_VALUES = [1000, 500, 100, 50, 20, 10, 5, 2, 1] as const;
export const USD_DENOMINATION_VALUES = [100, 50, 20, 10, 5, 1] as const;

export type PieceCounts = Readonly<Record<string, number | '' | null | undefined>>;

export function normalizePieceCount(value: number | '' | null | undefined): number {
  if (value === '' || value === null || value === undefined) {
    return 0;
  }
  return value;
}

export function isBlankAmount(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim().length === 0;
}

export function computeCountedTotal(
  denominations: readonly { value: string }[],
  counts: PieceCounts,
): string {
  const inputs = denominations.map((denom, index) => ({
    denominationId: index + 1,
    unitValue: denom.value,
    quantity: normalizePieceCount(counts[denom.value]),
  }));
  const result = calculateDenominationTotal(inputs);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.total;
}

export function computeVariance(declaredAmount: string, countedTotal: string): string {
  return subtractTellerAmounts(declaredAmount, countedTotal);
}

export function computeIsReconciled(declaredAmount: string, countedTotal: string): boolean {
  return amountsEqual(declaredAmount, countedTotal);
}

export function computeCheckFlag(declaredAmount: string, countedTotal: string): 'OK' | 'NO' {
  return computeIsReconciled(declaredAmount, countedTotal) ? 'OK' : 'NO';
}

export function sumPiecesForDenomination(
  rows: readonly PieceCounts[],
  denominationValue: string,
): number {
  return rows.reduce((sum, row) => sum + normalizePieceCount(row[denominationValue]), 0);
}

export function computeNetPieces(receivedPieces: number, paidPieces: number): number {
  return receivedPieces - paidPieces;
}

export function computeAmountForPieces(pieces: number, denominationValue: string): string {
  return formatTellerAmount(parseTellerDecimal(denominationValue).times(pieces));
}

export function computeWeightedAmount(
  denominations: readonly { value: string }[],
  counts: PieceCounts,
): string {
  return computeCountedTotal(denominations, counts);
}

export function countNonBlankAmounts(amounts: readonly (string | null | undefined)[]): number {
  return amounts.filter((amount) => !isBlankAmount(amount)).length;
}

export function emptyPieceCounts(denominations: readonly { value: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const denom of denominations) {
    counts[denom.value] = 0;
  }
  return counts;
}

export function rowCashAmount(
  denominations: readonly { value: string }[],
  row: { declaredAmount: string | null; counts: PieceCounts },
): string {
  return row.declaredAmount ?? computeCountedTotal(denominations, row.counts);
}

export function computeClosingPieceCounts(
  denominations: readonly { value: string }[],
  openingCounts: PieceCounts,
  deposits: readonly PieceCounts[],
  withdrawals: readonly PieceCounts[],
): Record<string, number> {
  const closing: Record<string, number> = {};
  for (const denom of denominations) {
    const received =
      normalizePieceCount(openingCounts[denom.value]) + sumPiecesForDenomination(deposits, denom.value);
    const paid = sumPiecesForDenomination(withdrawals, denom.value);
    closing[denom.value] = Math.max(0, computeNetPieces(received, paid));
  }
  return closing;
}

export function computeClosingAmount(
  denominations: readonly { value: string }[],
  openingAmount: string,
  deposits: readonly { declaredAmount: string | null; counts: PieceCounts }[],
  withdrawals: readonly { declaredAmount: string | null; counts: PieceCounts }[],
): string {
  let closing = openingAmount;
  for (const row of deposits) {
    closing = addTellerAmounts(closing, rowCashAmount(denominations, row));
  }
  for (const row of withdrawals) {
    closing = subtractTellerAmounts(closing, rowCashAmount(denominations, row));
  }
  return closing;
}

export function computeHeaderTotal(oppAmount: string, cashInICBA: string, cashOutICBA: string): string {
  return subtractTellerAmounts(addTellerAmounts(oppAmount, cashInICBA), cashOutICBA);
}

export function computeSessionSummary(input: {
  currencyCode: string;
  denominations: readonly { value: string }[];
  openingCounts?: PieceCounts;
  deposits: readonly { declaredAmount: string | null; counts: PieceCounts }[];
  withdrawals: readonly { declaredAmount: string | null; counts: PieceCounts }[];
  oppAmount: string;
  cashInICBA: string;
  cashOutICBA: string;
}): {
  totalReceivedByDenomination: Record<string, number>;
  totalPaidByDenomination: Record<string, number>;
  netPiecesByDenomination: Record<string, number>;
  totalAmountByDenomination: Record<string, string>;
  grandTotalReceivedAmount: string;
  grandTotalPaidAmount: string;
  grandTotalAmount: string;
  depositTransactionCount: number;
  withdrawalTransactionCount: number;
  totalTransactionCount: number;
  headerTotal: string;
  result: string;
} {
  const totalReceivedByDenomination: Record<string, number> = {};
  const totalPaidByDenomination: Record<string, number> = {};
  const netPiecesByDenomination: Record<string, number> = {};
  const totalAmountByDenomination: Record<string, string> = {};

  const openingCounts = input.openingCounts ?? {};
  const depositCounts = input.deposits.map((row) => row.counts);
  const withdrawalCounts = input.withdrawals.map((row) => row.counts);

  for (const denom of input.denominations) {
    const received =
      normalizePieceCount(openingCounts[denom.value]) + sumPiecesForDenomination(depositCounts, denom.value);
    const paid = sumPiecesForDenomination(withdrawalCounts, denom.value);
    const net = computeNetPieces(received, paid);
    totalReceivedByDenomination[denom.value] = received;
    totalPaidByDenomination[denom.value] = paid;
    netPiecesByDenomination[denom.value] = net;
    totalAmountByDenomination[denom.value] = computeAmountForPieces(net, denom.value);
  }

  const grandTotalReceivedAmount = computeWeightedAmount(input.denominations, totalReceivedByDenomination);
  const grandTotalPaidAmount = computeWeightedAmount(input.denominations, totalPaidByDenomination);
  const grandTotalAmount = input.denominations.reduce(
    (sum, denom) => addTellerAmounts(sum, totalAmountByDenomination[denom.value] ?? formatTellerAmount(parseTellerDecimal('0'))),
    formatTellerAmount(parseTellerDecimal('0')),
  );

  const depositTransactionCount = countNonBlankAmounts(input.deposits.map((row) => row.declaredAmount));
  const withdrawalTransactionCount = countNonBlankAmounts(input.withdrawals.map((row) => row.declaredAmount));

  return {
    totalReceivedByDenomination,
    totalPaidByDenomination,
    netPiecesByDenomination,
    totalAmountByDenomination,
    grandTotalReceivedAmount,
    grandTotalPaidAmount,
    grandTotalAmount,
    depositTransactionCount,
    withdrawalTransactionCount,
    totalTransactionCount: depositTransactionCount + withdrawalTransactionCount,
    headerTotal: computeHeaderTotal(input.oppAmount, input.cashInICBA, input.cashOutICBA),
    result: computeResult({
      currencyCode: input.currencyCode,
      oppAmount: input.oppAmount,
      cashInICBA: input.cashInICBA,
      cashOutICBA: input.cashOutICBA,
      grandTotalAmount,
    }),
  };
}

export function computeResult(input: {
  currencyCode: string;
  oppAmount: string;
  cashInICBA: string;
  cashOutICBA: string;
  grandTotalAmount: string;
}): string {
  if (input.currencyCode.trim().toUpperCase() === 'USD') {
    return subtractTellerAmounts(input.grandTotalAmount, input.oppAmount);
  }
  return subtractTellerAmounts(addTellerAmounts(input.oppAmount, input.cashInICBA), input.cashOutICBA);
}

export function computeRunningBalance(previous: string, direction: 'DEPOSIT' | 'WITHDRAWAL', amount: string): string {
  return direction === 'DEPOSIT' ? addTellerAmounts(previous, amount) : subtractTellerAmounts(previous, amount);
}
