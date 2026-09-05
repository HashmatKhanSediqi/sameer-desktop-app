export const INITIAL_WORKSHEET_ROWS = 20;

export interface WorksheetDraftRow<T> {
  key: string;
  id?: number;
  value: T;
}

export function mergeActiveWorksheetRow<T>(
  fresh: WorksheetDraftRow<T>[],
  current: WorksheetDraftRow<T>[],
  activeRowKey: string | null,
): WorksheetDraftRow<T>[] {
  if (!activeRowKey) {
    return fresh;
  }
  const active = current.find((row) => row.key === activeRowKey);
  return fresh.map((row) => (row.key === activeRowKey && active ? { ...active, id: row.id ?? active.id } : row));
}

export function resolveWorksheetRowCount(
  current: number,
  depositCount: number,
  withdrawalCount: number,
): number {
  return Math.max(INITIAL_WORKSHEET_ROWS, current, depositCount + 1, withdrawalCount);
}

export function worksheetRowNumbers(rowCount: number): number[] {
  return Array.from({ length: Math.max(0, rowCount) }, (_, index) => index + 1);
}

export function nextTellerBusinessDate(sessionDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sessionDate);
  if (!match) {
    return sessionDate;
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function suggestTellerExportFileName(currencyCode: string, sessionDate: string): string {
  const code = currencyCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'CUR';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sessionDate) ? sessionDate : 'date';
  return `FMT-Teller-${code}-${date}.xlsx`;
}

export function resolveWorksheetRowCountFromTransactions(
  current: number,
  deposits: ReadonlyArray<{ worksheetRow: number }>,
  withdrawals: ReadonlyArray<{ worksheetRow: number }>,
): number {
  return Math.max(
    INITIAL_WORKSHEET_ROWS,
    current,
    ...deposits.map((transaction) => transaction.worksheetRow),
    ...withdrawals.map((transaction) => transaction.worksheetRow),
  );
}

export function suggestTellerDailyExportFileName(sessionDate: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sessionDate) ? sessionDate : 'date';
  return `FMT-Teller-${date}.xlsx`;
}

export function planWorksheetSides(
  rowCount: number,
  depositCount: number,
  withdrawalCount: number,
): {
  numbers: number[];
  depositSlots: Array<'opening' | 'tx' | 'empty'>;
  withdrawalSlots: Array<'tx' | 'empty'>;
} {
  const count = resolveWorksheetRowCount(rowCount, depositCount, withdrawalCount);
  const numbers = worksheetRowNumbers(count);
  const depositSlots: Array<'opening' | 'tx' | 'empty'> = [];
  const withdrawalSlots: Array<'tx' | 'empty'> = [];
  for (let index = 0; index < count; index += 1) {
    if (index === 0) {
      depositSlots.push('opening');
    } else if (index - 1 < depositCount) {
      depositSlots.push('tx');
    } else {
      depositSlots.push('empty');
    }
    withdrawalSlots.push(index < withdrawalCount ? 'tx' : 'empty');
  }
  return { numbers, depositSlots, withdrawalSlots };
}
