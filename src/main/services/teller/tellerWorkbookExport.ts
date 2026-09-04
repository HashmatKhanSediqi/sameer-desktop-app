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
  styleFill(sheet.getCell(1, 1), title, BLUE, true);

  sheet.getCell(2, 1).value = 'Currency';
  sheet.getCell(2, 2).value = input.sheet.currencyCode;
  sheet.getCell(2, 3).value = 'Date';
  sheet.getCell(2, 4).value = input.sheet.session?.sessionDate ?? '';

  let row = 4;
  sheet.getCell(row, 1).value = 'Denominations';
  denoms.forEach((denom, index) => {
    sheet.getCell(row, 2 + index).value = Number(denom.value);
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
    });
    sheet.getCell(row, 2 + denoms.length).value = total === '' ? '' : Number(total);
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
    sheet.getCell(4 + index, metaCol).value = entry[0];
    sheet.getCell(4 + index, metaCol + 1).value = entry[1];
  });

  const logStart = 14;
  const withdrawStart = depositWidth + 2;
  writeLogBlock(sheet, logStart, 1, `DEPOSIT ${input.sheet.currencyCode}`, denoms, input.sheet.opening, input.sheet.deposits, input.worksheetRows, true);
  writeLogBlock(sheet, logStart, withdrawStart, `WITHDRAW ${input.sheet.currencyCode}`, denoms, null, input.sheet.withdrawals, input.worksheetRows, false);
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
  styleFill(sheet.getCell(startRow - 1, startCol), title, GREEN, true);

  const headers = ['NO', 'Name', 'Amount', ...denoms.map((item) => item.value), 'Check', 'Total', 'Tally'];
  headers.forEach((header, index) => {
    styleFill(sheet.getCell(startRow, startCol + index), header, GREEN, true);
  });

  for (let index = 0; index < worksheetRows; index += 1) {
    const excelRow = startRow + 1 + index;
    sheet.getCell(excelRow, startCol).value = index + 1;
    const isOp = includeOpening && Boolean(opening) && index === 0;
    const txIndex = includeOpening && opening ? index - 1 : index;
    const row = isOp
      ? {
          name: opening!.referenceLabel,
          amount: opening!.declaredAmount,
          counts: opening!.denominationCounts,
          check: opening!.check,
          total: opening!.countedTotal,
          tally: opening!.variance,
        }
      : transactions[txIndex]
        ? {
            name: transactions[txIndex]!.referenceLabel,
            amount: transactions[txIndex]!.declaredAmount ?? '',
            counts: transactions[txIndex]!.denominationCounts,
            check: transactions[txIndex]!.check,
            total: transactions[txIndex]!.countedTotal,
            tally: transactions[txIndex]!.variance,
          }
        : null;

    paintRange(sheet, excelRow, startCol, startCol + width - 1, isOp ? PEACH : GREEN_CELL);
    if (!row) {
      continue;
    }
    sheet.getCell(excelRow, startCol + 1).value = row.name;
    sheet.getCell(excelRow, startCol + 2).value = row.amount === '' ? '' : Number(row.amount);
    sheet.getCell(excelRow, startCol + 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isOp ? PEACH : LAVENDER } };
    denoms.forEach((denom, denomIndex) => {
      const quantity = row.counts[denom.value] ?? 0;
      sheet.getCell(excelRow, startCol + 3 + denomIndex).value = quantity === 0 ? '' : quantity;
    });
    sheet.getCell(excelRow, startCol + 3 + denoms.length).value = row.check;
    sheet.getCell(excelRow, startCol + 4 + denoms.length).value = Number(row.total);
    sheet.getCell(excelRow, startCol + 5 + denoms.length).value = Number(row.tally);
  }
}

function styleFill(cell: ExcelJS.Cell, value: string | number, color: string, bold: boolean): void {
  cell.value = value;
  cell.font = { bold, color: { argb: color === GREEN || color === BLUE ? 'FFFFFFFF' : 'FF1F4E79' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
}

function paintRange(sheet: ExcelJS.Worksheet, row: number, from: number, to: number, color: string): void {
  for (let col = from; col <= to; col += 1) {
    sheet.getCell(row, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
  }
}
