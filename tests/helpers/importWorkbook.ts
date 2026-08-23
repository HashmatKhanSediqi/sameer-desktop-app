import ExcelJS from 'exceljs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CUSTOMER_HEADERS, TRANSACTION_HEADERS } from '../../src/shared/types/import';

export interface ImportWorkbookSpec {
  customers?: Array<Array<unknown>>;
  transactions?: Array<Array<unknown>>;
  customerHeaders?: string[];
  transactionHeaders?: string[];
  includeCustomersSheet?: boolean;
  includeTransactionsSheet?: boolean;
  extraSheets?: Array<{ name: string; rows: Array<Array<unknown>> }>;
}

export async function writeImportWorkbook(filePath: string, spec: ImportWorkbookSpec): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const includeCustomers = spec.includeCustomersSheet ?? Boolean(spec.customers);
  const includeTransactions = spec.includeTransactionsSheet ?? true;

  if (includeCustomers) {
    const sheet = workbook.addWorksheet('Customers');
    sheet.addRow(spec.customerHeaders ?? [...CUSTOMER_HEADERS]);
    for (const row of spec.customers ?? []) {
      sheet.addRow(row);
    }
  }

  if (includeTransactions) {
    const sheet = workbook.addWorksheet('Transactions');
    sheet.addRow(spec.transactionHeaders ?? [...TRANSACTION_HEADERS]);
    for (const row of spec.transactions ?? []) {
      sheet.addRow(row);
    }
  }

  for (const extra of spec.extraSheets ?? []) {
    const sheet = workbook.addWorksheet(extra.name);
    for (const row of extra.rows) {
      sheet.addRow(row);
    }
  }

  mkdirSync(join(filePath, '..'), { recursive: true });
  await workbook.xlsx.writeFile(filePath);
}
