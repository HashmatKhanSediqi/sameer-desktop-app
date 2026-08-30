export type WorksheetNavCol = 'name' | 'amount' | `d:${string}`;
export type WorksheetNavMode = 'up' | 'down' | 'left' | 'right';

export interface WorksheetNavRow {
  key: string;
  isOpening?: boolean;
}

export function editableWorksheetCols(
  isOpening: boolean | undefined,
  denominationValues: string[],
): WorksheetNavCol[] {
  if (isOpening) {
    return [];
  }
  const cols: WorksheetNavCol[] = ['name', 'amount'];
  for (const value of denominationValues) {
    cols.push(`d:${value}`);
  }
  return cols;
}

function adjacentEditableRow(
  rows: readonly WorksheetNavRow[],
  fromIndex: number,
  step: number,
): WorksheetNavRow | undefined {
  let index = fromIndex + step;
  while (index >= 0 && index < rows.length) {
    const row = rows[index];
    if (row && !row.isOpening) {
      return row;
    }
    index += step;
  }
  return undefined;
}

export function nextWorksheetFocus(
  rows: WorksheetNavRow[],
  rowKey: string,
  col: WorksheetNavCol,
  mode: WorksheetNavMode,
  denominationValues: string[],
  caret: { atStart: boolean; atEnd: boolean } = { atStart: true, atEnd: true },
): { rowKey: string; col: WorksheetNavCol; append: boolean } | null {
  const rowIndex = rows.findIndex((row) => row.key === rowKey);
  const current = rows[rowIndex];
  if (rowIndex < 0 || !current) {
    return null;
  }
  const cols = editableWorksheetCols(current.isOpening, denominationValues);
  const colIndex = cols.indexOf(col);
  const safeCol = (row: WorksheetNavRow, preferred: WorksheetNavCol): WorksheetNavCol => {
    const nextCols = editableWorksheetCols(row.isOpening, denominationValues);
    return nextCols.includes(preferred) ? preferred : (nextCols[0] ?? 'name');
  };

  if (mode === 'up') {
    const previous = adjacentEditableRow(rows, rowIndex, -1);
    if (!previous) {
      return null;
    }
    return { rowKey: previous.key, col: safeCol(previous, col), append: false };
  }

  if (mode === 'down') {
    const next = adjacentEditableRow(rows, rowIndex, 1);
    if (!next) {
      return { rowKey, col: cols.includes(col) ? col : 'amount', append: true };
    }
    return { rowKey: next.key, col: safeCol(next, col), append: false };
  }

  if (mode === 'right') {
    if (!caret.atEnd) {
      return null;
    }
    const nextCol = colIndex >= 0 ? cols[colIndex + 1] : undefined;
    if (nextCol) {
      return { rowKey: current.key, col: nextCol, append: false };
    }
    const next = adjacentEditableRow(rows, rowIndex, 1);
    if (!next) {
      return { rowKey, col: 'name', append: true };
    }
    return { rowKey: next.key, col: editableWorksheetCols(next.isOpening, denominationValues)[0] ?? 'name', append: false };
  }

  if (!caret.atStart) {
    return null;
  }
  const prevCol = colIndex > 0 ? cols[colIndex - 1] : undefined;
  if (prevCol) {
    return { rowKey: current.key, col: prevCol, append: false };
  }
  const previous = adjacentEditableRow(rows, rowIndex, -1);
  if (!previous) {
    return null;
  }
  const prevCols = editableWorksheetCols(previous.isOpening, denominationValues);
  return { rowKey: previous.key, col: prevCols[prevCols.length - 1] ?? 'amount', append: false };
}
