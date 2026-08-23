import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import ExcelJS from 'exceljs';
import type { ReportModel } from '@shared/types/report';

const CASH_IN = 'FF16A34A';
const CASH_OUT = 'FFDC2626';
const HEADER_FILL = 'FFF1F5F9';
const HEADER_FONT = 'FF0F172A';

export async function renderExcelReport(model: ReportModel, filePath: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = model.appName;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName(model.title), {
    views: [
      {
        state: 'frozen',
        ySplit: 1,
        rightToLeft: model.direction === 'rtl',
      },
    ],
    pageSetup: {
      orientation:
        model.type === 'customer' || model.type === 'currency_summary' ? 'portrait' : 'landscape',
      fitToPage: true,
    },
  });

  const rtl = model.direction === 'rtl';
  let rowNumber = 1;

  rowNumber = addTitleRows(sheet, model, rowNumber);
  rowNumber += 1;

  if (model.customer) {
    rowNumber = addSectionLabel(sheet, model.labels.sectionCustomer, rowNumber, rtl);
    rowNumber = addKeyValues(
      sheet,
      [
        [model.labels.customer, model.customer.name],
        [model.labels.number, model.customer.customerNumber || model.labels.unnamedCustomer],
        [model.labels.cashIn, String(model.customer.cashInCount)],
        [model.labels.cashOut, String(model.customer.cashOutCount)],
      ],
      rowNumber,
    );
    rowNumber += 1;
  }

  if (model.currencySummaries.length > 0) {
    rowNumber = addSectionLabel(sheet, model.labels.sectionCurrencies, rowNumber, rtl);
    const headers = [
      model.labels.currency,
      model.labels.cashIn,
      model.labels.cashOut,
      model.labels.balance,
      model.labels.transactionCount,
      model.labels.activityCustomerCount,
    ];
    const data = model.currencySummaries.map((summary) => [
      summary.currencyCode,
      Number.parseFloat(summary.cashInTotal),
      Number.parseFloat(summary.cashOutTotal),
      Number.parseFloat(summary.balance),
      summary.transactionCount,
      summary.customerCount,
    ]);
    rowNumber = addTable(sheet, headers, data, rowNumber, rtl, {
      moneyColumns: [2, 3, 4],
      colorColumns: { 2: CASH_IN, 3: CASH_OUT },
    });
    rowNumber += 1;
  }

  if (model.customers.length > 0) {
    rowNumber = addSectionLabel(sheet, model.labels.sectionCustomers, rowNumber, rtl);
    const codes = model.currencySummaries.map((item) => item.currencyCode);
    const headers = [
      model.labels.customer,
      model.labels.number,
      ...codes,
      model.labels.cashIn,
      model.labels.cashOut,
    ];
    const data = model.customers.map((customer) => [
      customer.name,
      customer.customerNumber,
      ...codes.map((code) => Number.parseFloat(customer.balances[code] ?? '0')),
      customer.cashInCount,
      customer.cashOutCount,
    ]);
    const moneyColumns = codes.map((_code, index) => index + 3);
    rowNumber = addTable(sheet, headers, data, rowNumber, rtl, { moneyColumns });
    rowNumber += 1;
  }

  if (model.transactions.length > 0) {
    rowNumber = addSectionLabel(sheet, model.labels.sectionTransactions, rowNumber, rtl);
    const includeCustomer = model.type !== 'customer';
    const headers = [
      ...(includeCustomer ? [model.labels.customer, model.labels.number] : []),
      model.labels.date,
      model.labels.type,
      model.labels.currency,
      model.labels.amount,
      model.labels.note,
    ];
    const data = model.transactions.map((row) => [
      ...(includeCustomer ? [row.customerName, row.customerNumber] : []),
      row.displayDate,
      row.typeLabel,
      row.currencyCode,
      Number.parseFloat(row.amount.replace(/,/g, '')) || row.amount,
      row.note,
    ]);
    const typeFlags = model.transactions.map((row) => row.type);
    const typeIndex = includeCustomer ? 4 : 2;
    const amountIndex = includeCustomer ? 6 : 4;
    const noteIndex = includeCustomer ? 7 : 5;
    rowNumber = addTable(sheet, headers, data, rowNumber, rtl, {
      moneyColumns: [amountIndex],
      wrapColumns: [noteIndex],
      typeColumn: typeIndex,
      typeFlags,
    });
    rowNumber += 1;
  }

  if (model.empty) {
    const cell = sheet.getCell(rowNumber, 1);
    cell.value = model.noDataMessage;
    rowNumber += 2;
  }

  addKeyValues(
    sheet,
    [
      [model.labels.customerCount, model.customerCount],
      [model.labels.transactionCount, model.transactionCount],
    ],
    rowNumber,
  );

  autosize(sheet);
  await workbook.xlsx.writeFile(filePath);
}

function sheetName(title: string): string {
  const cleaned = title.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31);
  return cleaned.length > 0 ? cleaned : 'Report';
}

function addTitleRows(sheet: ExcelJS.Worksheet, model: ReportModel, start: number): number {
  let row = start;
  if (model.company) {
    if (model.company.logoPath && existsSync(model.company.logoPath)) {
      try {
        const extension = extname(model.company.logoPath).replace('.', '').toLowerCase();
        const imageId = sheet.workbook.addImage({
          buffer: readFileSync(model.company.logoPath),
          extension: extension === 'jpg' || extension === 'jpeg' ? 'jpeg' : extension === 'webp' ? 'png' : 'png',
        });
        sheet.addImage(imageId, {
          tl: { col: 0, row: row - 1 },
          ext: { width: 72, height: 72 },
        });
        sheet.getRow(row).height = 54;
        row += 1;
      } catch {
        // Continue without a logo if Excel cannot embed the file.
      }
    }
    sheet.getCell(row, 1).value = model.company.name;
    sheet.getCell(row, 1).font = { bold: true, size: 16, color: { argb: HEADER_FONT } };
    row += 1;
    const details = [
      model.company.phone ? `${model.labels.companyPhone}: ${model.company.phone}` : null,
      model.company.email ? `${model.labels.companyEmail}: ${model.company.email}` : null,
      model.company.address ? `${model.labels.companyAddress}: ${model.company.address}` : null,
      model.company.website ? `${model.labels.companyWebsite}: ${model.company.website}` : null,
    ].filter((line): line is string => Boolean(line));
    for (const line of details) {
      sheet.getCell(row, 1).value = line;
      row += 1;
    }
    row += 1;
  }

  sheet.getCell(row, 1).value = model.appName;
  sheet.getCell(row, 1).font = { bold: true, size: 14, color: { argb: HEADER_FONT } };
  sheet.getCell(row + 1, 1).value = model.title;
  sheet.getCell(row + 1, 1).font = { bold: true, size: 16, color: { argb: HEADER_FONT } };
  sheet.getCell(row + 2, 1).value = `${model.generatedAtLabel}: ${model.generatedAt}`;
  sheet.getCell(row + 3, 1).value = model.languageLabel;
  if (model.dateRangeLabel) {
    sheet.getCell(row + 4, 1).value = model.dateRangeLabel;
    return row + 4;
  }
  return row + 3;
}

function addSectionLabel(sheet: ExcelJS.Worksheet, label: string, rowNumber: number, _rtl: boolean): number {
  const cell = sheet.getCell(rowNumber, 1);
  cell.value = label;
  cell.font = { bold: true, size: 12, color: { argb: HEADER_FONT } };
  return rowNumber + 1;
}

function addKeyValues(sheet: ExcelJS.Worksheet, rows: Array<[string, string | number]>, start: number): number {
  rows.forEach((pair, index) => {
    sheet.getCell(start + index, 1).value = pair[0];
    sheet.getCell(start + index, 2).value = pair[1];
  });
  return start + rows.length;
}

interface TableOptions {
  moneyColumns?: number[];
  wrapColumns?: number[];
  colorColumns?: Record<number, string>;
  typeColumn?: number;
  typeFlags?: Array<'CASH_IN' | 'CASH_OUT'>;
}

function addTable(
  sheet: ExcelJS.Worksheet,
  headers: string[],
  data: Array<Array<string | number>>,
  startRow: number,
  rtl: boolean,
  options: TableOptions,
): number {
  const orderedHeaders = rtl ? [...headers].reverse() : headers;
  const headerRow = sheet.getRow(startRow);
  orderedHeaders.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.font = { bold: true, color: { argb: HEADER_FONT } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { wrapText: true, vertical: 'middle' };
  });
  headerRow.commit();

  data.forEach((values, rowIndex) => {
    const ordered = rtl ? [...values].reverse() : values;
    const excelRow = sheet.getRow(startRow + 1 + rowIndex);
    const typeFlag = options.typeFlags?.[rowIndex];
    ordered.forEach((value, index) => {
      const sourceIndex = rtl ? values.length - index : index + 1;
      const cell = excelRow.getCell(index + 1);
      cell.value = value;
      cell.alignment = { vertical: 'top', wrapText: options.wrapColumns?.includes(sourceIndex) ?? false };

      if (options.moneyColumns?.includes(sourceIndex) && typeof value === 'number') {
        cell.numFmt = '#,##0.00';
        cell.alignment = { ...cell.alignment, horizontal: 'right' };
      }

      const color = options.colorColumns?.[sourceIndex];
      if (color) {
        cell.font = { color: { argb: color }, bold: true };
      }

      if (options.typeColumn === sourceIndex && typeFlag) {
        cell.font = { color: { argb: typeFlag === 'CASH_OUT' ? CASH_OUT : CASH_IN }, bold: true };
      }
      if (options.moneyColumns?.includes(sourceIndex) && typeFlag) {
        cell.font = { ...(cell.font ?? {}), color: { argb: typeFlag === 'CASH_OUT' ? CASH_OUT : CASH_IN } };
      }
    });
    excelRow.commit();
  });

  return startRow + 1 + data.length;
}

function autosize(sheet: ExcelJS.Worksheet): void {
  sheet.columns.forEach((column) => {
    let width = 12;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      const value = cell.value === null || cell.value === undefined ? '' : String(cell.value);
      width = Math.min(48, Math.max(width, Math.min(40, value.length + 2)));
      if (typeof cell.value === 'string' && cell.value.length > 40) {
        cell.alignment = { ...(cell.alignment ?? {}), wrapText: true };
        width = Math.max(width, 36);
      }
    });
    column.width = width;
  });
}
