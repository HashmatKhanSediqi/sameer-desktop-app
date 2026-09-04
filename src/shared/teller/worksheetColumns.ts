export interface TellerWorksheetColumn {
  id: string;
  denominationValue?: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
}

const FIXED_COLUMNS: Record<'no' | 'name' | 'amount' | 'check' | 'total' | 'tally', TellerWorksheetColumn> = {
  no: { id: 'no', defaultWidth: 28, minWidth: 28, maxWidth: 52 },
  name: { id: 'name', defaultWidth: 120, minWidth: 120, maxWidth: 280 },
  amount: { id: 'amount', defaultWidth: 64, minWidth: 64, maxWidth: 140 },
  check: { id: 'check', defaultWidth: 40, minWidth: 40, maxWidth: 80 },
  total: { id: 'total', defaultWidth: 48, minWidth: 48, maxWidth: 120 },
  tally: { id: 'tally', defaultWidth: 48, minWidth: 48, maxWidth: 120 },
};

export function buildTellerWorksheetColumns(denominationValues: readonly string[]): TellerWorksheetColumn[] {
  return [
    FIXED_COLUMNS.no,
    FIXED_COLUMNS.name,
    FIXED_COLUMNS.amount,
    ...denominationValues.map((value) => ({
      id: `d:${value}`,
      denominationValue: value,
      defaultWidth: 26,
      minWidth: 26,
      maxWidth: 88,
    })),
    FIXED_COLUMNS.check,
    FIXED_COLUMNS.total,
    FIXED_COLUMNS.tally,
  ];
}

export function defaultTellerWorksheetWidths(denominationValues: readonly string[]): Record<string, number> {
  return Object.fromEntries(
    buildTellerWorksheetColumns(denominationValues).map((column) => [column.id, column.defaultWidth]),
  );
}
