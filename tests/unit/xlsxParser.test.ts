import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseImportWorkbook } from '../../src/main/services/import/xlsxParser';
import { writeImportWorkbook } from '../helpers/importWorkbook';
import { createTestDatabase } from '../helpers/testDatabase';

const ACTIVE = new Set(['AFN', 'USD', 'EUR']);

describe('xlsx import parser', () => {
  it('parses a valid transactions workbook', async () => {
    const testDb = createTestDatabase();
    try {
      const filePath = join(testDb.dbPath, '..', 'valid.xlsx');
      await writeImportWorkbook(filePath, {
        transactions: [['C-001', 'Ahmad Khan', 'CASH_IN', 'AFN', 50000, '2025-01-15', 'Initial']],
      });

      const parsed = await parseImportWorkbook(filePath, { activeCurrencyCodes: ACTIVE });
      expect(parsed.errors).toEqual([]);
      expect(parsed.transactions).toHaveLength(1);
      expect(parsed.transactions[0]).toMatchObject({
        customerNumber: 'C-001',
        type: 'CASH_IN',
        currencyCode: 'AFN',
        amount: '50000',
        note: 'Initial',
      });
    } finally {
      testDb.cleanup();
    }
  });

  it('reports missing required headers', async () => {
    const testDb = createTestDatabase();
    try {
      const filePath = join(testDb.dbPath, '..', 'headers.xlsx');
      await writeImportWorkbook(filePath, {
        transactionHeaders: ['customer_name', 'note'],
        transactions: [['Ahmad', 'hello']],
      });

      const parsed = await parseImportWorkbook(filePath, { activeCurrencyCodes: ACTIVE });
      expect(parsed.errors.some((error) => error.code === 'MISSING_HEADER')).toBe(true);
      expect(parsed.transactions).toHaveLength(0);
    } finally {
      testDb.cleanup();
    }
  });

  it('rejects invalid currency, type, amount, and date rows with row numbers', async () => {
    const testDb = createTestDatabase();
    try {
      const filePath = join(testDb.dbPath, '..', 'invalid-rows.xlsx');
      await writeImportWorkbook(filePath, {
        transactions: [
          ['C-001', 'Ahmad', 'CASH_IN', 'GBP', 10, '2025-01-01', ''],
          ['C-002', 'Ahmad', 'TRANSFER', 'AFN', 10, '2025-01-01', ''],
          ['C-003', 'Ahmad', 'CASH_IN', 'AFN', 0, '2025-01-01', ''],
          ['C-004', 'Ahmad', 'CASH_IN', 'AFN', 10, 'not-a-date', ''],
        ],
      });

      const parsed = await parseImportWorkbook(filePath, { activeCurrencyCodes: ACTIVE });
      const codes = parsed.errors.map((error) => error.code);
      expect(codes).toContain('INVALID_CURRENCY');
      expect(codes).toContain('INVALID_TYPE');
      expect(codes).toContain('INVALID_AMOUNT');
      expect(codes).toContain('INVALID_DATE');
      expect(parsed.errors.every((error) => error.row >= 2)).toBe(true);
    } finally {
      testDb.cleanup();
    }
  });

  it('treats a malformed xlsx package as INVALID_FORMAT', async () => {
    const testDb = createTestDatabase();
    try {
      const filePath = join(testDb.dbPath, '..', 'malformed.xlsx');
      writeFileSync(filePath, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff]));
      const parsed = await parseImportWorkbook(filePath, { activeCurrencyCodes: ACTIVE });
      expect(parsed.errors[0]?.code).toBe('INVALID_FORMAT');
    } finally {
      testDb.cleanup();
    }
  });

  it('returns NO_DATA for a header-only file', async () => {
    const testDb = createTestDatabase();
    try {
      const filePath = join(testDb.dbPath, '..', 'empty-rows.xlsx');
      await writeImportWorkbook(filePath, { transactions: [] });
      const parsed = await parseImportWorkbook(filePath, { activeCurrencyCodes: ACTIVE });
      expect(parsed.errors.some((error) => error.code === 'NO_DATA')).toBe(true);
    } finally {
      testDb.cleanup();
    }
  });

  it('preserves UTF-8 Dari notes and large notes', async () => {
    const testDb = createTestDatabase();
    try {
      const filePath = join(testDb.dbPath, '..', 'notes.xlsx');
      const longNote = `یادداشت ${'A'.repeat(20_000)}`;
      await writeImportWorkbook(filePath, {
        transactions: [['', 'مهمان', 'CASH_IN', 'AFN', '100.5', '', longNote]],
      });
      const parsed = await parseImportWorkbook(filePath, { activeCurrencyCodes: ACTIVE });
      expect(parsed.errors).toEqual([]);
      expect(parsed.transactions[0]?.note).toBe(longNote);
    } finally {
      testDb.cleanup();
    }
  });

  it('uses cached formula results and does not treat the formula as the amount', async () => {
    const testDb = createTestDatabase();
    try {
      const filePath = join(testDb.dbPath, '..', 'formula.xlsx');
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Transactions');
      sheet.addRow(['customer_number', 'customer_name', 'type', 'currency', 'amount', 'date', 'note']);
      const row = sheet.addRow(['C-009', 'Formula User', 'CASH_IN', 'USD', 0, '2025-03-01', '']);
      row.getCell(5).value = { formula: 'A1+999999', result: 12.5 };
      await workbook.xlsx.writeFile(filePath);

      const parsed = await parseImportWorkbook(filePath, { activeCurrencyCodes: ACTIVE });
      expect(parsed.errors).toEqual([]);
      expect(parsed.transactions[0]?.amount).toBe('12.5');
    } finally {
      testDb.cleanup();
    }
  });

  it('warns about unknown columns and ignores them', async () => {
    const testDb = createTestDatabase();
    try {
      const filePath = join(testDb.dbPath, '..', 'extra-col.xlsx');
      await writeImportWorkbook(filePath, {
        transactionHeaders: [
          'customer_number',
          'customer_name',
          'type',
          'currency',
          'amount',
          'date',
          'note',
          'bonus',
        ],
        transactions: [['C-010', 'Extra', 'CASH_OUT', 'EUR', '9', '2025-04-01', 'n', 'ignore-me']],
      });
      const parsed = await parseImportWorkbook(filePath, { activeCurrencyCodes: ACTIVE });
      expect(parsed.warnings.some((warning) => warning.code === 'UNKNOWN_COLUMN')).toBe(true);
      expect(parsed.transactions).toHaveLength(1);
    } finally {
      testDb.cleanup();
    }
  });

  it('stops when the row limit is exceeded', async () => {
    const testDb = createTestDatabase();
    try {
      const filePath = join(testDb.dbPath, '..', 'too-many.xlsx');
      await writeImportWorkbook(filePath, {
        transactions: [
          ['C-001', 'A', 'CASH_IN', 'AFN', '1', '2025-01-01', ''],
          ['C-002', 'B', 'CASH_IN', 'AFN', '2', '2025-01-02', ''],
        ],
      });
      const parsed = await parseImportWorkbook(filePath, { activeCurrencyCodes: ACTIVE, maxRows: 1 });
      expect(parsed.errors.some((error) => error.code === 'TOO_MANY_ROWS')).toBe(true);
    } finally {
      testDb.cleanup();
    }
  });

  it('rejects transaction rows that have neither customer number nor name', async () => {
    const testDb = createTestDatabase();
    try {
      const filePath = join(testDb.dbPath, '..', 'missing-customer.xlsx');
      await writeImportWorkbook(filePath, {
        transactions: [['', '', 'CASH_IN', 'AFN', '10', '2025-01-01', '']],
      });
      const parsed = await parseImportWorkbook(filePath, { activeCurrencyCodes: ACTIVE });
      expect(parsed.errors.some((error) => error.code === 'MISSING_CUSTOMER')).toBe(true);
    } finally {
      testDb.cleanup();
    }
  });
});
