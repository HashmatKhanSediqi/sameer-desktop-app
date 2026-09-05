import { existsSync } from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { computeClosingAmount, computeClosingPieceCounts } from '@shared/teller/workbookMath';
import type { TellerOpeningRow, TellerSheet, TellerTransaction } from '@shared/types/teller';
import { AppError } from '../../utils/errors';

export function uniqueExcelPath(filePath: string): string {
  if (!existsSync(filePath)) {
    return filePath;
  }
  const ext = path.extname(filePath) || '.xlsx';
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, ext);
  let index = 2;
  let next = path.join(dir, `${base}-${index}${ext}`);
  while (existsSync(next)) {
    index += 1;
    next = path.join(dir, `${base}-${index}${ext}`);
  }
  return next;
}

const BLUE = 'FF5B9BD5';
const GREEN = 'FF548235';
const GREEN_CELL = 'FFE2EFDA';
const PEACH = 'FFF8CBAD';
const LAVENDER = 'FFD5A6E6';
const SUMMARY_LABEL = 'FFFFF2CC';
const SUMMARY_RESULT = 'FFC6EFCE';
const BORDER_COLOR = 'FF404040';
const NUMBER_FORMAT = '#,##0.####';

export interface TellerDayExportInput {
  sheet: TellerSheet;
  worksheetRows: number;
  closingAmount: string;
  closingCounts: Record<string, number>;
}

export async function writeTellerDayWorkbook(filePath: string, inputs: TellerDayExportInput[]): Promise<string> {
  const target = uniqueExcelPath(filePath);
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'FMT';
    workbook.created = new Date();
    for (const input of inputs) {
      const worksheet = workbook.addWorksheet(input.sheet.currencyCode, {
        views: [{ showGridLines: true, state: 'frozen', ySplit: 14 }],
      });
      renderWorkbook(worksheet, input);
    }
    await workbook.xlsx.writeFile(target);
    return target;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('TELLER_EXPORT_FAILED', 'TELLER_EXPORT_FAILED');
  }
}

export function computeDayClosing(sheet: TellerSheet): { amount: string; counts: Record<string, number> } {
  const openingCounts = sheet.opening?.denominationCounts ?? {};
  const openingAmount = sheet.opening?.declaredAmount ?? sheet.session?.openingAmount ?? '0';
  return {
    amount: computeClosingAmount(
      sheet.denominations,
      openingAmount,
      sheet.deposits.map((row) => ({ declaredAmount: row.declaredAmount, counts: row.denominationCounts })),
      sheet.withdrawals.map((row) => ({ declaredAmount: row.declaredAmount, counts: row.denominationCounts })),
    ),
    counts: computeClosingPieceCounts(
      sheet.denominations,
      openingCounts,
      sheet.deposits.map((row) => row.denominationCounts),
      sheet.withdrawals.map((row) => row.denominationCounts),
    ),
  };
}

function renderWorkbook(sheet: ExcelJS.Worksheet, input: TellerDayExportInput): void {
  const denoms = input.sheet.denominations;
  const depositWidth = 6 + denoms.length;
  const title =
    input.sheet.currencyCode === 'AFN'
      ? 'Deposit Or Withdrawal Final Sheet AFN'
      : input.sheet.currencyCode === 'USD'
        ? 'Cash Deposit or Withdrawal Final Sheet USD'
        : `Cash Deposit or Withdrawal Final Sheet ${input.sheet.currencyCode}`;

  sheet.mergeCells(1, 1, 1, depositWidth + 1 + depositWidth);
  styleMergedRange(sheet, 1, 1, depositWidth + 1 + depositWidth, title, BLUE);
  sheet.getRow(1).height = 24;

  styleLabelValue(sheet, 2, 1, 'Currency', input.sheet.currencyCode);
  styleLabelValue(sheet, 2, 3, 'Date', input.sheet.session?.sessionDate ?? '');
  sheet.getRow(2).height = 20;

  let row = 4;
  sheet.getCell(row, 1).value = 'Denominations';
  denoms.forEach((denom, index) => {
    sheet.getCell(row, 2 + index).value = Number(denom.value);
    sheet.getCell(row, 2 + index).numFmt = NUMBER_FORMAT;
  });
  sheet.getCell(row, 2 + denoms.length).value = 'Total';
  paintRange(sheet, row, 1, 2 + denoms.length, BLUE);

  const summary = input.sheet.summary;
  const summaryRows: Array<[string, Record<string, number | string>, string]> = [
    ['Cash Received from Customers', summary.totalReceivedByDenomination, summary.grandTotalReceivedAmount],
    ['Cash Paid to Customers', summary.totalPaidByDenomination, summary.grandTotalPaidAmount],
    ['Total Amount', summary.totalAmountByDenomination, summary.grandTotalAmount],
    ['Total Pieces', summary.netPiecesByDenomination, ''],
  ];
  for (const [label, byDenom, total] of summaryRows) {
    row += 1;
    sheet.getCell(row, 1).value = label;
    denoms.forEach((denom, index) => {
      sheet.getCell(row, 2 + index).value = byDenom[denom.value] ?? 0;
      sheet.getCell(row, 2 + index).numFmt = NUMBER_FORMAT;
    });
    sheet.getCell(row, 2 + denoms.length).value = total === '' ? '' : Number(total);
    sheet.getCell(row, 2 + denoms.length).numFmt = NUMBER_FORMAT;
    paintRange(sheet, row, 1, 2 + denoms.length, 'FFD6DCE4');
    sheet.getCell(row, 1).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    sheet.getRow(row).height = 24;
  }

  const metaCol = 4 + denoms.length;
  const meta: Array<[string, string | number]> = [
    ['Total Deposit', summary.depositTransactionCount],
    ['Total Withdrawal', summary.withdrawalTransactionCount],
    ['Total Transactions', summary.totalTransactionCount],
    ['Opp-Amount', Number(summary.oppAmount)],
    ['TOTAL', Number(summary.headerTotal)],
    ['RESULT', Number(summary.result)],
    ['Closing cash', Number(input.closingAmount)],
  ];
  meta.forEach((entry, index) => {
    const metaRow = 4 + index;
    const labelCell = sheet.getCell(metaRow, metaCol);
    const valueCell = sheet.getCell(metaRow, metaCol + 1);
    labelCell.value = entry[0];
    valueCell.value = entry[1];
    styleCell(labelCell, SUMMARY_LABEL, true, 'left');
    styleCell(valueCell, entry[0] === 'RESULT' ? SUMMARY_RESULT : 'FFFFFFFF', true, 'center');
    if (typeof entry[1] === 'number') {
      valueCell.numFmt = NUMBER_FORMAT;
    }
    sheet.getRow(metaRow).height = Math.max(sheet.getRow(metaRow).height ?? 0, 20);
  });

  const logStart = 14;
  const withdrawStart = depositWidth + 2;
  writeLogBlock(sheet, logStart, 1, `DEPOSIT ${input.sheet.currencyCode}`, denoms, input.sheet.opening, input.sheet.deposits, input.worksheetRows, true);
  writeLogBlock(sheet, logStart, withdrawStart, `WITHDRAW ${input.sheet.currencyCode}`, denoms, null, input.sheet.withdrawals, input.worksheetRows, false);
  setLogColumnWidths(sheet, 1, denoms.length);
  sheet.getColumn(depositWidth + 1).width = 2;
  setLogColumnWidths(sheet, withdrawStart, denoms.length);
}

function writeLogBlock(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  startCol: number,
  title: string,
  denoms: TellerSheet['denominations'],
  opening: TellerOpeningRow | null,
  transactions: TellerTransaction[],
  worksheetRows: number,
  includeOpening: boolean,
): void {
  const width = 6 + denoms.length;
  sheet.mergeCells(startRow - 1, startCol, startRow - 1, startCol + width - 1);
  styleMergedRange(sheet, startRow - 1, startCol, startCol + width - 1, title, GREEN);
  sheet.getRow(startRow - 1).height = 24;

  const headers = ['NO', 'Name', 'Amount', ...denoms.map((item) => item.value), 'Check', 'Total', 'Tally'];
  headers.forEach((header, index) => {
    styleFill(sheet.getCell(startRow, startCol + index), header, GREEN, true);
  });
  sheet.getRow(startRow).height = 22;

  const transactionsByRow = new Map(transactions.map((transaction) => [transaction.worksheetRow, transaction]));
  for (let index = 0; index < worksheetRows; index += 1) {
    const excelRow = startRow + 1 + index;
    sheet.getCell(excelRow, startCol).value = index + 1;
    const isOp = includeOpening && Boolean(opening) && index === 0;
    const row = isOp
      ? {
          name: opening!.referenceLabel,
          amount: opening!.declaredAmount,
          counts: opening!.denominationCounts,
          check: opening!.check,
          total: opening!.countedTotal,
          tally: opening!.variance,
        }
      : transactionsByRow.get(index + 1)
        ? {
            name: transactionsByRow.get(index + 1)!.referenceLabel,
            amount: transactionsByRow.get(index + 1)!.declaredAmount ?? '',
            counts: transactionsByRow.get(index + 1)!.denominationCounts,
            check: transactionsByRow.get(index + 1)!.check,
            total: transactionsByRow.get(index + 1)!.countedTotal,
            tally: transactionsByRow.get(index + 1)!.variance,
          }
        : null;

    paintRange(sheet, excelRow, startCol, startCol + width - 1, isOp ? PEACH : GREEN_CELL);
    sheet.getRow(excelRow).height = 20;
    if (!row) {
      continue;
    }
    sheet.getCell(excelRow, startCol + 1).value = row.name;
    sheet.getCell(excelRow, startCol + 1).alignment = { horizontal: 'left', vertical: 'middle' };
    sheet.getCell(excelRow, startCol + 2).value = row.amount === '' ? '' : Number(row.amount);
    sheet.getCell(excelRow, startCol + 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isOp ? PEACH : LAVENDER } };
    sheet.getCell(excelRow, startCol + 2).numFmt = NUMBER_FORMAT;
    denoms.forEach((denom, denomIndex) => {
      const quantity = row.counts[denom.value] ?? 0;
      sheet.getCell(excelRow, startCol + 3 + denomIndex).value = quantity === 0 ? '' : quantity;
      sheet.getCell(excelRow, startCol + 3 + denomIndex).numFmt = '0';
    });
    sheet.getCell(excelRow, startCol + 3 + denoms.length).value = row.check;
    sheet.getCell(excelRow, startCol + 4 + denoms.length).value = Number(row.total);
    sheet.getCell(excelRow, startCol + 5 + denoms.length).value = Number(row.tally);
    sheet.getCell(excelRow, startCol + 4 + denoms.length).numFmt = NUMBER_FORMAT;
    sheet.getCell(excelRow, startCol + 5 + denoms.length).numFmt = NUMBER_FORMAT;
  }
}

function styleFill(cell: ExcelJS.Cell, value: string | number, color: string, bold: boolean): void {
  cell.value = value;
  cell.font = { bold, color: { argb: color === GREEN || color === BLUE ? 'FFFFFFFF' : 'FF1F4E79' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  applyBorder(cell);
}

function paintRange(sheet: ExcelJS.Worksheet, row: number, from: number, to: number, color: string): void {
  for (let col = from; col <= to; col += 1) {
    styleCell(sheet.getCell(row, col), color, false, 'center');
  }
}

function styleMergedRange(
  sheet: ExcelJS.Worksheet,
  row: number,
  from: number,
  to: number,
  value: string,
  color: string,
): void {
  styleFill(sheet.getCell(row, from), value, color, true);
  for (let column = from; column <= to; column += 1) {
    const cell = sheet.getCell(row, column);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    applyBorder(cell);
  }
}

function styleLabelValue(
  sheet: ExcelJS.Worksheet,
  row: number,
  column: number,
  label: string,
  value: string,
): void {
  const labelCell = sheet.getCell(row, column);
  const valueCell = sheet.getCell(row, column + 1);
  labelCell.value = label;
  valueCell.value = value;
  styleCell(labelCell, SUMMARY_LABEL, true, 'left');
  styleCell(valueCell, 'FFFFFFFF', false, 'center');
}

function styleCell(
  cell: ExcelJS.Cell,
  color: string,
  bold: boolean,
  horizontal: 'left' | 'center' | 'right',
): void {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
  cell.font = { ...cell.font, bold };
  cell.alignment = { horizontal, vertical: 'middle', wrapText: true };
  applyBorder(cell);
}

function applyBorder(cell: ExcelJS.Cell): void {
  const border = { style: 'thin' as const, color: { argb: BORDER_COLOR } };
  cell.border = { top: border, left: border, bottom: border, right: border };
}

function setLogColumnWidths(sheet: ExcelJS.Worksheet, startCol: number, denominationCount: number): void {
  const widths = [6, 22, 13, ...Array.from({ length: denominationCount }, () => 8), 9, 13, 13];
  widths.forEach((width, index) => {
    sheet.getColumn(startCol + index).width = width;
  });
}
