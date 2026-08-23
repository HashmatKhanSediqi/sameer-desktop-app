import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { AppError } from '../../src/main/utils/errors';
import { createCustomerTestHarness } from '../helpers/customerHarness';
import type { ReportGenerateInput } from '../../src/shared/types/report';

async function seedTwoCustomers(harness: Awaited<ReturnType<typeof createCustomerTestHarness>>) {
  const ahmad = harness.customerService.create({ name: 'Ahmad', customerNumber: 'C-1' });
  const fatima = harness.customerService.create({ name: 'فاطمه', customerNumber: 'C-2' });

  harness.transactionService.create({
    customerId: ahmad.id,
    type: 'CASH_IN',
    amount: '1000',
    currencyCode: 'AFN',
    transactionDate: '2026-01-10',
    note: 'Opening',
  });
  harness.transactionService.create({
    customerId: ahmad.id,
    type: 'CASH_OUT',
    amount: '250',
    currencyCode: 'AFN',
    transactionDate: '2026-01-15',
    note: 'A long note that should wrap inside the note column and never spill into amount or date columns.',
  });
  harness.transactionService.create({
    customerId: ahmad.id,
    type: 'CASH_IN',
    amount: '50.5',
    currencyCode: 'USD',
    transactionDate: '2026-02-01',
  });
  harness.transactionService.create({
    customerId: fatima.id,
    type: 'CASH_OUT',
    amount: '10',
    currencyCode: 'EUR',
    transactionDate: '2026-03-01',
  });

  return { ahmad, fatima };
}

describe('ReportsService', () => {
  it('computes per-currency cash in, cash out, and balance without mixing currencies', async () => {
    const harness = await createCustomerTestHarness();
    try {
      const { ahmad } = await seedTwoCustomers(harness);
      const model = harness.reportsService.buildModel({
        type: 'customer',
        format: 'pdf',
        language: 'en',
        customerId: ahmad.id,
      });

      const afn = model.currencySummaries.find((item) => item.currencyCode === 'AFN');
      const usd = model.currencySummaries.find((item) => item.currencyCode === 'USD');
      const eur = model.currencySummaries.find((item) => item.currencyCode === 'EUR');
      expect(afn?.cashInTotal).toBe('1000.0000');
      expect(afn?.cashOutTotal).toBe('250.0000');
      expect(afn?.balance).toBe('750.0000');
      expect(usd?.balance).toBe('50.5000');
      expect(eur?.balance).toBe('0.0000');
      expect(eur?.cashInTotal).toBe('0.0000');
      expect(model.customer?.cashInCount).toBe(2);
      expect(model.customer?.cashOutCount).toBe(1);
      expect(model.transactionCount).toBe(3);
      expect(model.customer?.displayCreatedAt).toBeTruthy();
      expect(model.transactions[0]?.displayTime.length).toBeGreaterThan(0);
      expect(model.transactions.every((row) => row.currencyCode === 'AFN' || row.currencyCode === 'USD')).toBe(true);
    } finally {
      harness.cleanup();
    }
  });

  it('filters date range reports and ignores transactions outside the range', async () => {
    const harness = await createCustomerTestHarness();
    try {
      await seedTwoCustomers(harness);
      const model = harness.reportsService.buildModel({
        type: 'date_range',
        format: 'xlsx',
        language: 'en',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      });

      expect(model.transactionCount).toBe(2);
      expect(model.transactions.every((row) => row.transactionDate.startsWith('2026-01'))).toBe(true);
      const afn = model.currencySummaries.find((item) => item.currencyCode === 'AFN');
      expect(afn?.balance).toBe('750.0000');
      expect(model.currencySummaries.find((item) => item.currencyCode === 'USD')?.balance).toBe('0.0000');
      expect(model.customerCount).toBe(1);
    } finally {
      harness.cleanup();
    }
  });

  it('returns REPORT_NO_DATA for an empty date range', async () => {
    const harness = await createCustomerTestHarness();
    try {
      await seedTwoCustomers(harness);
      expect(() =>
        harness.reportsService.buildModel({
          type: 'date_range',
          format: 'pdf',
          language: 'en',
          startDate: '2020-01-01',
          endDate: '2020-01-31',
        }),
      ).toThrow(AppError);
      try {
        harness.reportsService.buildModel({
          type: 'date_range',
          format: 'pdf',
          language: 'en',
          startDate: '2020-01-01',
          endDate: '2020-01-31',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe('REPORT_NO_DATA');
      }
    } finally {
      harness.cleanup();
    }
  });

  it('rejects a missing customer and inverted dates', async () => {
    const harness = await createCustomerTestHarness();
    try {
      expect(() =>
        harness.reportsService.buildModel({
          type: 'customer',
          format: 'pdf',
          language: 'en',
          customerId: 9999,
        }),
      ).toThrow(AppError);

      const { parseReportGenerateInput } = await import('../../src/main/services/report/reportValidation');
      expect(() =>
        parseReportGenerateInput({
          type: 'date_range',
          format: 'pdf',
          language: 'en',
          startDate: '2026-02-01',
          endDate: '2026-01-01',
        }),
      ).toThrow(AppError);
    } finally {
      harness.cleanup();
    }
  });

  it('builds an all-customers report with independent balances and counts', async () => {
    const harness = await createCustomerTestHarness();
    try {
      await seedTwoCustomers(harness);
      const model = harness.reportsService.buildModel({
        type: 'all_customers',
        format: 'xlsx',
        language: 'en',
      });
      expect(model.customerCount).toBe(2);
      expect(model.customers).toHaveLength(2);
      const ahmad = model.customers.find((row) => row.name === 'Ahmad');
      expect(ahmad?.balances.AFN).toBe('750.0000');
      expect(ahmad?.cashInCount).toBe(2);
      expect(model.currencySummaries.find((item) => item.currencyCode === 'EUR')?.balance).toBe('-10.0000');
    } finally {
      harness.cleanup();
    }
  });

  it('localizes Dari report labels while keeping AFN/USD/EUR codes unchanged', async () => {
    const harness = await createCustomerTestHarness();
    try {
      const { ahmad } = await seedTwoCustomers(harness);
      const model = harness.reportsService.buildModel({
        type: 'customer',
        format: 'pdf',
        language: 'fa-AF',
        customerId: ahmad.id,
      });
      expect(model.direction).toBe('rtl');
      expect(model.labels.cashIn).toBe('دریافت وجه');
      expect(model.currencySummaries.map((item) => item.currencyCode)).toEqual(['AFN', 'USD', 'EUR']);
    } finally {
      harness.cleanup();
    }
  });

  it('writes a valid Excel workbook with frozen header, wrap, and RTL for Dari', async () => {
    const harness = await createCustomerTestHarness();
    try {
      await seedTwoCustomers(harness);
      const input: ReportGenerateInput = {
        type: 'transactions',
        format: 'xlsx',
        language: 'fa-AF',
      };
      const generated = await harness.reportsService.generate(input);
      expect(existsSync(generated.filePath)).toBe(true);
      expect(generated.fileName.endsWith('.xlsx')).toBe(true);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(generated.filePath);
      const sheet = workbook.worksheets[0];
      expect(sheet).toBeDefined();
      expect(sheet?.views[0]?.rightToLeft).toBe(true);
      expect(sheet?.views[0]?.state).toBe('frozen');

      const texts: string[] = [];
      sheet?.eachRow((row) => {
        row.eachCell((cell) => {
          if (typeof cell.value === 'string') {
            texts.push(cell.value);
          }
        });
      });
      expect(texts.some((value) => value.includes('نغدې') || value.includes('دریافت') || value.includes('پرداخت'))).toBe(
        true,
      );
    } finally {
      harness.cleanup();
    }
  });

  it('writes an English PDF that starts with a PDF header', async () => {
    const harness = await createCustomerTestHarness();
    try {
      const { ahmad } = await seedTwoCustomers(harness);
      const generated = await harness.reportsService.generate({
        type: 'customer',
        format: 'pdf',
        language: 'en',
        customerId: ahmad.id,
      });
      const bytes = readFileSync(generated.filePath);
      expect(bytes.subarray(0, 5).toString('utf8')).toBe('%PDF-');
      expect(generated.fileName).toMatch(/^FMT_Customer_Ahmad_C-1_\d{4}-\d{2}-\d{2}\.pdf$/);
    } finally {
      harness.cleanup();
    }
  });

  it('writes a Dari PDF when Arabic-script fonts are present, otherwise fails with FONT_MISSING', async () => {
    const harness = await createCustomerTestHarness();
    try {
      const { fatima } = await seedTwoCustomers(harness);
      try {
        const generated = await harness.reportsService.generate({
          type: 'customer',
          format: 'pdf',
          language: 'fa-AF',
          customerId: fatima.id,
        });
        const bytes = readFileSync(generated.filePath);
        expect(bytes.subarray(0, 5).toString('utf8')).toBe('%PDF-');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe('FONT_MISSING');
      }
    } finally {
      harness.cleanup();
    }
  });

  it('builds a customer PDF model with zero balances when the customer has no transactions', async () => {
    const harness = await createCustomerTestHarness();
    try {
      const empty = harness.customerService.create({ name: 'Noor', customerNumber: 'N-9' });
      const model = harness.reportsService.buildModel({
        type: 'customer',
        format: 'pdf',
        language: 'en',
        customerId: empty.id,
      });

      expect(model.empty).toBe(true);
      expect(model.transactionCount).toBe(0);
      expect(model.customer?.name).toBe('Noor');
      expect(model.customer?.customerNumber).toBe('N-9');
      expect(model.currencySummaries.map((item) => item.currencyCode)).toEqual(['AFN', 'USD', 'EUR']);
      for (const summary of model.currencySummaries) {
        expect(summary.cashInTotal).toBe('0.0000');
        expect(summary.cashOutTotal).toBe('0.0000');
        expect(summary.balance).toBe('0.0000');
      }

      const generated = await harness.reportsService.generate({
        type: 'customer',
        format: 'pdf',
        language: 'en',
        customerId: empty.id,
      });
      expect(existsSync(generated.filePath)).toBe(true);
      expect(generated.fileName).toMatch(/^FMT_Customer_Noor_N-9_\d{4}-\d{2}-\d{2}\.pdf$/);
    } finally {
      harness.cleanup();
    }
  });
});
