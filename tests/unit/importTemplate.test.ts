import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeImportTemplate } from '../../src/main/services/import/importTemplate';
import { createTestDatabase } from '../helpers/testDatabase';

describe('import template', () => {
  it('writes an xlsx template with Customers, Transactions, and instructions', async () => {
    const testDb = createTestDatabase();
    try {
      const filePath = join(testDb.dbPath, '..', 'FMT_Import_Template.xlsx');
      await writeImportTemplate(filePath, 'en');
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      expect(workbook.getWorksheet('Customers')).toBeTruthy();
      expect(workbook.getWorksheet('Transactions')).toBeTruthy();
      expect(workbook.getWorksheet('Instructions')).toBeTruthy();
      expect(workbook.getWorksheet('Customers')?.getRow(1).getCell(1).value).toBe('customer_number');
      expect(workbook.getWorksheet('Transactions')?.getRow(1).getCell(3).value).toBe('type');
    } finally {
      testDb.cleanup();
    }
  });
});
