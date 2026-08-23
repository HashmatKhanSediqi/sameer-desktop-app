import ExcelJS from 'exceljs';
import { writeFileSync } from 'node:fs';
import type { SupportedLocale } from '@shared/types/locale';
import { getDocumentDirection } from '@shared/types/locale';
import { CUSTOMER_HEADERS, TRANSACTION_HEADERS } from '@shared/types/import';
import { importT } from './importI18n';

export async function buildImportTemplateBuffer(locale: SupportedLocale): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FMT';
  workbook.created = new Date();
  const rtl = getDocumentDirection(locale) === 'rtl';

  addInstructionsSheet(workbook, locale, rtl);
  addCustomersSheet(workbook, rtl);
  addTransactionsSheet(workbook, rtl);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function writeImportTemplate(filePath: string, locale: SupportedLocale): Promise<void> {
  const buffer = await buildImportTemplateBuffer(locale);
  writeFileSync(filePath, buffer);
}

function addInstructionsSheet(workbook: ExcelJS.Workbook, locale: SupportedLocale, rtl: boolean): void {
  const sheet = workbook.addWorksheet(importT(locale, 'template.instructionsSheet'), {
    views: [{ rightToLeft: rtl }],
  });
  sheet.getCell('A1').value = importT(locale, 'title');
  sheet.getCell('A1').font = { bold: true, size: 14 };
  sheet.getCell('A2').value = importT(locale, 'template.instructions');
  sheet.getCell('A2').alignment = { wrapText: true, vertical: 'top' };
  sheet.getColumn(1).width = 80;
  sheet.getRow(2).height = 80;
}

function addCustomersSheet(workbook: ExcelJS.Workbook, rtl: boolean): void {
  const sheet = workbook.addWorksheet('Customers', {
    views: [{ state: 'frozen', ySplit: 1, rightToLeft: rtl }],
  });
  sheet.addRow([...CUSTOMER_HEADERS]);
  sheet.addRow(['C-001', 'Ahmad Khan', '']);
  styleHeader(sheet, CUSTOMER_HEADERS.length);
  sheet.getColumn(1).width = 22;
  sheet.getColumn(2).width = 28;
  sheet.getColumn(3).width = 24;
}

function addTransactionsSheet(workbook: ExcelJS.Workbook, rtl: boolean): void {
  const sheet = workbook.addWorksheet('Transactions', {
    views: [{ state: 'frozen', ySplit: 1, rightToLeft: rtl }],
  });
  sheet.addRow([...TRANSACTION_HEADERS]);
  sheet.addRow(['C-001', 'Ahmad Khan', 'CASH_IN', 'AFN', '50000', '2026-01-15', 'Initial deposit']);
  styleHeader(sheet, TRANSACTION_HEADERS.length);
  sheet.getColumn(1).width = 22;
  sheet.getColumn(2).width = 28;
  sheet.getColumn(3).width = 14;
  sheet.getColumn(4).width = 12;
  sheet.getColumn(5).width = 14;
  sheet.getColumn(6).width = 14;
  sheet.getColumn(7).width = 36;
  sheet.getColumn(7).alignment = { wrapText: true };
}

function styleHeader(sheet: ExcelJS.Worksheet, columnCount: number): void {
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' },
  };
  for (let column = 1; column <= columnCount; column += 1) {
    header.getCell(column).protection = { locked: true };
  }
}
