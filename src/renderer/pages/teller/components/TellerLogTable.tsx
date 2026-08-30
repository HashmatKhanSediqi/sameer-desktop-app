import { useEffect, useRef, useState, type KeyboardEvent, type UIEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  computeCheckFlag,
  computeCountedTotal,
  computeVariance,
  isBlankAmount,
} from '@shared/teller/workbookMath';
import { nextWorksheetFocus, type WorksheetNavCol } from '@shared/teller/worksheetNav';
import type { TellerDenomination, TellerDirection, TellerOpeningRow, TellerTransaction } from '@shared/types/teller';
import { useLocaleFormat } from '../../../hooks/useLocaleFormat';
import { formatTellerMoney, formatTellerPlainAmount, parsePieceInput } from '../tellerDisplay';

export interface DraftRow {
  key: string;
  id?: number;
  sequenceNo: number | string;
  referenceLabel: string;
  declaredAmount: string;
  counts: Record<string, string>;
  isOpening?: boolean;
}

interface TellerLogTableProps {
  direction: TellerDirection;
  currencyCode: string;
  denominations: TellerDenomination[];
  transactions: TellerTransaction[];
  opening?: TellerOpeningRow | null;
  rowCount: number;
  disabled: boolean;
  openingLocked?: boolean;
  onPersist: (row: DraftRow) => void;
  onNeedRow: () => void;
  onBodyScroll?: (scrollTop: number, source: HTMLDivElement) => void;
  bodyRef?: (element: HTMLDivElement | null) => void;
}

type EditableCol = WorksheetNavCol;

function emptyCounts(denominations: TellerDenomination[]): Record<string, string> {
  const counts: Record<string, string> = {};
  for (const denom of denominations) {
    counts[denom.value] = '';
  }
  return counts;
}

function countsFromPieces(denominations: TellerDenomination[], pieces: Record<string, number>): Record<string, string> {
  const counts = emptyCounts(denominations);
  for (const denom of denominations) {
    const quantity = pieces[denom.value] ?? 0;
    counts[denom.value] = quantity === 0 ? '' : String(quantity);
  }
  return counts;
}

function toDrafts(
  direction: TellerDirection,
  transactions: TellerTransaction[],
  denominations: TellerDenomination[],
  rowCount: number,
  opening?: TellerOpeningRow | null,
): DraftRow[] {
  const rows: DraftRow[] = [];
  for (let index = 0; index < rowCount; index += 1) {
    const sequenceNo = index + 1;
    if (direction === 'DEPOSIT' && opening && index === 0) {
      rows.push({
        key: 'op',
        sequenceNo,
        referenceLabel: opening.referenceLabel,
        declaredAmount: formatTellerPlainAmount(opening.declaredAmount),
        counts: countsFromPieces(denominations, opening.denominationCounts),
        isOpening: true,
      });
      continue;
    }
    const txIndex = direction === 'DEPOSIT' && opening ? index - 1 : index;
    const transaction = transactions[txIndex];
    if (transaction) {
      rows.push({
        key: `row-${transaction.id}`,
        id: transaction.id,
        sequenceNo,
        referenceLabel: transaction.referenceLabel,
        declaredAmount: formatTellerPlainAmount(transaction.declaredAmount),
        counts: countsFromPieces(denominations, transaction.denominationCounts),
      });
      continue;
    }
    rows.push({
      key: `draft-${index}`,
      sequenceNo,
      referenceLabel: '',
      declaredAmount: '',
      counts: emptyCounts(denominations),
    });
  }
  return rows;
}

function defaultColWidths(denominations: TellerDenomination[]): Record<string, number> {
  const widths: Record<string, number> = {
    no: 36,
    name: 148,
    amount: 76,
    check: 48,
    total: 64,
    tally: 64,
  };
  for (const denom of denominations) {
    widths[`d:${denom.value}`] = 42;
  }
  return widths;
}

const COL_BOUNDS: Record<string, { min: number; max: number }> = {
  no: { min: 28, max: 52 },
  name: { min: 120, max: 280 },
  amount: { min: 64, max: 140 },
  check: { min: 40, max: 80 },
  total: { min: 48, max: 120 },
  tally: { min: 48, max: 120 },
};

function boundsFor(colId: string): { min: number; max: number } {
  return COL_BOUNDS[colId] ?? { min: 36, max: 88 };
}

function measureColumnWidth(table: HTMLTableElement, colIndex: number, colId: string): number {
  const { min, max } = boundsFor(colId);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let width = min;
  const cells = table.querySelectorAll(`tr > :nth-child(${colIndex + 1})`);
  cells.forEach((cell) => {
    const element = cell as HTMLElement;
    const input = element.querySelector('input');
    const text = (input?.value || element.textContent || '00').trim();
    const style = window.getComputedStyle(input ?? element);
    if (ctx) {
      ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      width = Math.max(width, Math.ceil(ctx.measureText(text.length === 0 ? '00' : text).width) + 18);
    }
  });
  return Math.min(max, Math.max(min, width));
}

function scrollWithin(container: HTMLElement, target: HTMLElement): void {
  const cRect = container.getBoundingClientRect();
  const tRect = target.getBoundingClientRect();
  if (tRect.top < cRect.top) {
    container.scrollTop -= cRect.top - tRect.top;
  } else if (tRect.bottom > cRect.bottom) {
    container.scrollTop += tRect.bottom - cRect.bottom;
  }
  if (tRect.left < cRect.left) {
    container.scrollLeft -= cRect.left - tRect.left;
  } else if (tRect.right > cRect.right) {
    container.scrollLeft += tRect.right - cRect.right;
  }
}

export function TellerLogTable({
  direction,
  currencyCode,
  denominations,
  transactions,
  opening,
  rowCount,
  disabled,
  onPersist,
  onNeedRow,
  onBodyScroll,
  bodyRef,
}: TellerLogTableProps): JSX.Element {
  const { t } = useTranslation('teller');
  const { formatMoney } = useLocaleFormat();
  const tableRef = useRef<HTMLTableElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const bodyElRef = useRef<HTMLDivElement | null>(null);
  const pendingFocus = useRef<{ rowKey: string; col: EditableCol } | null>(null);
  const [rows, setRows] = useState<DraftRow[]>(() =>
    toDrafts(direction, transactions, denominations, rowCount, opening),
  );
  const [colWidths, setColWidths] = useState(() => defaultColWidths(denominations));
  const denomValues = denominations.map((denom) => denom.value);
  const colIds = ['no', 'name', 'amount', ...denomValues.map((value) => `d:${value}`), 'check', 'total', 'tally'];

  useEffect(() => {
    setColWidths(defaultColWidths(denominations));
  }, [currencyCode, direction]);

  useEffect(() => {
    setRows(toDrafts(direction, transactions, denominations, rowCount, opening));
  }, [direction, transactions, denominations, opening, rowCount]);

  useEffect(() => {
    const next = pendingFocus.current;
    if (!next) {
      return;
    }
    pendingFocus.current = null;
    const input = tableRef.current?.querySelector<HTMLInputElement>(
      `input[data-row="${next.rowKey}"][data-col="${next.col}"]`,
    );
    if (!input) {
      return;
    }
    input.focus({ preventScroll: true });
    input.select();
    const cell = input.closest('td') ?? input;
    if (bodyElRef.current) {
      scrollWithin(bodyElRef.current, cell);
      if (headRef.current) {
        headRef.current.scrollLeft = bodyElRef.current.scrollLeft;
      }
      onBodyScroll?.(bodyElRef.current.scrollTop, bodyElRef.current);
    }
  }, [rows, onBodyScroll]);

  function updateRow(key: string, patch: Partial<DraftRow>): DraftRow {
    let nextRow = rows.find((row) => row.key === key);
    if (!nextRow) {
      return {
        key,
        sequenceNo: '',
        referenceLabel: '',
        declaredAmount: '',
        counts: emptyCounts(denominations),
      };
    }
    nextRow = {
      ...nextRow,
      ...patch,
      counts: patch.counts ? { ...nextRow.counts, ...patch.counts } : nextRow.counts,
    };
    setRows((current) => current.map((row) => (row.key === key ? nextRow! : row)));
    return nextRow;
  }

  function persist(row: DraftRow): void {
    if (row.isOpening) {
      return;
    }
    onPersist(row);
  }

  function focusCell(rowKey: string, col: EditableCol): void {
    pendingFocus.current = { rowKey, col };
    const input = tableRef.current?.querySelector<HTMLInputElement>(
      `input[data-row="${rowKey}"][data-col="${col}"]`,
    );
    if (!input) {
      return;
    }
    pendingFocus.current = null;
    input.focus({ preventScroll: true });
    input.select();
    const cell = input.closest('td') ?? input;
    if (bodyElRef.current) {
      scrollWithin(bodyElRef.current, cell);
      if (headRef.current) {
        headRef.current.scrollLeft = bodyElRef.current.scrollLeft;
      }
      onBodyScroll?.(bodyElRef.current.scrollTop, bodyElRef.current);
    }
  }

  function applyNav(row: DraftRow, col: EditableCol, mode: 'up' | 'down' | 'left' | 'right', caret?: { atStart: boolean; atEnd: boolean }): void {
    const next = nextWorksheetFocus(rows, row.key, col, mode, denomValues, caret);
    if (!next) {
      return;
    }
    if (next.append) {
      pendingFocus.current = { rowKey: `draft-${rowCount}`, col: next.col };
      onNeedRow();
      return;
    }
    focusCell(next.rowKey, next.col);
  }

  function handleKey(
    event: KeyboardEvent<HTMLInputElement>,
    row: DraftRow,
    col: EditableCol,
    patch: Partial<DraftRow>,
  ): void {
    const target = event.currentTarget;
    const caret = {
      atStart: target.selectionStart === 0,
      atEnd: target.selectionEnd === target.value.length,
    };
    if (event.key === 'Enter' || event.key === 'ArrowDown') {
      event.preventDefault();
      updateRow(row.key, patch);
      applyNav(row, col, 'down');
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      updateRow(row.key, patch);
      applyNav(row, col, 'up');
      return;
    }
    if (event.key === 'ArrowRight') {
      const next = nextWorksheetFocus(rows, row.key, col, 'right', denomValues, caret);
      if (!next) {
        return;
      }
      event.preventDefault();
      updateRow(row.key, patch);
      applyNav(row, col, 'right', caret);
      return;
    }
    if (event.key === 'ArrowLeft') {
      const next = nextWorksheetFocus(rows, row.key, col, 'left', denomValues, caret);
      if (!next) {
        return;
      }
      event.preventDefault();
      updateRow(row.key, patch);
      applyNav(row, col, 'left', caret);
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      updateRow(row.key, patch);
      applyNav(row, col, event.shiftKey ? 'left' : 'right');
    }
  }

  function autofit(colId: string, colIndex: number): void {
    const table = tableRef.current;
    if (!table) {
      return;
    }
    const width = measureColumnWidth(table, colIndex, colId);
    setColWidths((current) => ({ ...current, [colId]: width }));
  }

  function handleBodyScroll(event: UIEvent<HTMLDivElement>): void {
    const body = event.currentTarget;
    if (headRef.current) {
      headRef.current.scrollLeft = body.scrollLeft;
    }
    onBodyScroll?.(body.scrollTop, body);
  }

  function handleHeadScroll(event: UIEvent<HTMLDivElement>): void {
    if (bodyElRef.current) {
      bodyElRef.current.scrollLeft = event.currentTarget.scrollLeft;
    }
  }

  function setBody(element: HTMLDivElement | null): void {
    bodyElRef.current = element;
    bodyRef?.(element);
  }

  const title =
    direction === 'DEPOSIT'
      ? t('sheet.titleDepositSection', { currency: currencyCode })
      : t('sheet.titleWithdrawalSection', { currency: currencyCode });

  function renderColgroup(): JSX.Element {
    return (
      <colgroup>
        {colIds.map((colId) => (
          <col key={colId} style={{ width: colWidths[colId] }} />
        ))}
      </colgroup>
    );
  }

  return (
    <section className={direction === 'DEPOSIT' ? 'teller-log teller-log-deposit' : 'teller-log teller-log-withdrawal'}>
      <div className="teller-log-head" ref={headRef} onScroll={handleHeadScroll}>
        <table className="teller-sheet-table">
          {renderColgroup()}
          <thead>
            <tr>
              <th className="teller-th-title" colSpan={colIds.length}>
                {title}
              </th>
            </tr>
            <tr>
              {colIds.map((colId, index) => (
                <th
                  key={colId}
                  className={colId === 'name' ? 'teller-th-name' : undefined}
                  onDoubleClick={() => autofit(colId, index)}
                >
                  {colId === 'no'
                    ? t('sheet.no')
                    : colId === 'name'
                      ? t('sheet.name')
                      : colId === 'amount'
                        ? t('sheet.amount')
                        : colId === 'check'
                          ? t('sheet.check')
                          : colId === 'total'
                            ? t('sheet.total')
                            : colId === 'tally'
                              ? t('sheet.tally')
                              : colId.slice(2)}
                  <span
                    className="teller-col-resizer"
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      autofit(colId, index);
                    }}
                  />
                </th>
              ))}
            </tr>
          </thead>
        </table>
      </div>
      <div className="teller-log-body" ref={setBody} onScroll={handleBodyScroll}>
        <table ref={tableRef} className="teller-sheet-table">
          {renderColgroup()}
          <tbody>
            {rows.map((row) => {
              const counted = computeCountedTotal(
                denominations,
                Object.fromEntries(
                  denominations.map((denom) => [denom.value, parsePieceInput(row.counts[denom.value] ?? '')]),
                ),
              );
              const declared = row.declaredAmount.trim();
              const check = isBlankAmount(declared) ? '' : computeCheckFlag(declared, counted);
              const variance = isBlankAmount(declared) ? '' : computeVariance(declared, counted);
              return (
                <tr key={row.key} className={row.isOpening ? 'is-op' : undefined}>
                  <td className="teller-cell-calc teller-cell-no">{row.sequenceNo}</td>
                  <td className="teller-cell-name">
                    <input
                      className="teller-input-ref"
                      data-row={row.key}
                      data-col="name"
                      value={row.referenceLabel}
                      disabled={disabled || row.isOpening}
                      readOnly={row.isOpening}
                      onChange={(event) => updateRow(row.key, { referenceLabel: event.target.value })}
                      onBlur={(event) => persist(updateRow(row.key, { referenceLabel: event.target.value }))}
                      onKeyDown={(event) =>
                        handleKey(event, row, 'name', { referenceLabel: (event.target as HTMLInputElement).value })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="teller-input-amount"
                      data-row={row.key}
                      data-col="amount"
                      inputMode="decimal"
                      value={row.declaredAmount}
                      disabled={disabled || Boolean(row.isOpening)}
                      readOnly={Boolean(row.isOpening)}
                      onChange={(event) => updateRow(row.key, { declaredAmount: event.target.value })}
                      onBlur={(event) => persist(updateRow(row.key, { declaredAmount: event.target.value }))}
                      onKeyDown={(event) =>
                        handleKey(event, row, 'amount', { declaredAmount: (event.target as HTMLInputElement).value })
                      }
                    />
                  </td>
                  {denominations.map((denom) => (
                    <td key={denom.id}>
                      <input
                        className="teller-input-pieces"
                        data-row={row.key}
                        data-col={`d:${denom.value}`}
                        inputMode="numeric"
                        value={row.counts[denom.value] ?? ''}
                        disabled={disabled || Boolean(row.isOpening)}
                        readOnly={Boolean(row.isOpening)}
                        onChange={(event) =>
                          updateRow(row.key, { counts: { [denom.value]: event.target.value } })
                        }
                        onBlur={(event) =>
                          persist(updateRow(row.key, { counts: { [denom.value]: event.target.value } }))
                        }
                        onKeyDown={(event) =>
                          handleKey(event, row, `d:${denom.value}`, {
                            counts: { [denom.value]: (event.target as HTMLInputElement).value },
                          })
                        }
                      />
                    </td>
                  ))}
                  <td className={check === 'NO' ? 'teller-cell-calc is-no' : 'teller-cell-calc is-ok'}>
                    {check === 'OK' ? t('sheet.ok') : check === 'NO' ? t('sheet.noFlag') : ''}
                  </td>
                  <td className="teller-cell-calc">
                    {declared || Object.values(row.counts).some(Boolean) ? formatTellerMoney(formatMoney, counted) : ''}
                  </td>
                  <td className={variance.startsWith('-') ? 'teller-cell-calc is-no' : 'teller-cell-calc'}>
                    {variance === '' ? '' : formatTellerMoney(formatMoney, variance)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
