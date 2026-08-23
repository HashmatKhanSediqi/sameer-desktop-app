import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/main/utils/errors';
import { resolveReportFontFiles } from '../../src/main/config/fontsPath';
import { describePdfReport } from '../../src/main/services/report/pdfReport';
import { ReportsService } from '../../src/main/services/report/reportsService';
import { containsPresentationForms, shapeRtlText } from '../../src/main/services/report/rtlText';
import { createCustomerTestHarness } from '../helpers/customerHarness';
import { inspectPdf, pdfContainsChars, pdfContainsCodepoints, pdfContainsLatin } from '../helpers/pdfInspect';

describe('customer PDF layout and fonts', () => {
  it('prefers Noto Naskh Arabic for embedded PDF Arabic text', () => {
    const fonts = resolveReportFontFiles(join(process.cwd(), 'assets', 'fonts'));
    expect(fonts.arabic).toBeTruthy();
    expect(fonts.arabic?.replaceAll('\\', '/')).toMatch(/NotoNaskhArabic-Regular\.ttf$/);
    expect(fonts.latin?.replaceAll('\\', '/')).toMatch(/Inter-Regular\.ttf$/);
  });

  it('writes a professional English customer PDF with table sections and separate currencies', async () => {
    const harness = await createCustomerTestHarness();
    try {
      const customer = harness.customerService.create({ name: 'Ahmad', customerNumber: 'C-1' });
      harness.transactionService.create({
        customerId: customer.id,
        type: 'CASH_IN',
        amount: '1000',
        currencyCode: 'AFN',
        transactionDate: '2026-01-10T09:15',
        note: 'Opening',
      });
      harness.transactionService.create({
        customerId: customer.id,
        type: 'CASH_OUT',
        amount: '25',
        currencyCode: 'USD',
        transactionDate: '2026-01-11T16:40',
      });

      const model = harness.reportsService.buildModel({
        type: 'customer',
        format: 'pdf',
        language: 'en',
        customerId: customer.id,
      });
      const outline = describePdfReport(model);
      expect(outline.customerFields.map((row) => row.value)).toEqual(expect.arrayContaining(['Ahmad', 'C-1']));
      expect(outline.currencies.map((row) => row.currencyCode)).toEqual(['AFN', 'USD', 'EUR']);
      expect(outline.currencies.find((row) => row.currencyCode === 'AFN')?.balance).toBe('1000.0000');
      expect(outline.currencies.find((row) => row.currencyCode === 'USD')?.balance).toBe('-25.0000');
      expect(outline.currencies.find((row) => row.currencyCode === 'EUR')?.balance).toBe('0.0000');
      expect(outline.transactionColumns).toEqual(['Date', 'Time', 'Type', 'Currency', 'Amount', 'Note']);
      expect(outline.transactions.map((row) => row.note)).toContain('Opening');
      expect(outline.transactions.find((row) => row.note === 'Opening')?.time.length).toBeGreaterThan(0);
      expect(outline.totals.some((row) => row.field === 'AFN' && row.value === '1000.0000')).toBe(true);
      expect(outline.totals.some((row) => row.field === 'USD' && row.value === '-25.0000')).toBe(true);

      const generated = await harness.reportsService.generate({
        type: 'customer',
        format: 'pdf',
        language: 'en',
        customerId: customer.id,
      });
      const pdf = inspectPdf(generated.filePath);
      expect(pdf.isPdf).toBe(true);
      expect(pdf.embedsLatinFont).toBe(true);
      expect(pdfContainsLatin(pdf, 'Opening')).toBe(true);
      expect(pdfContainsLatin(pdf, 'AFN') || pdfContainsCodepoints(pdf, 'AFN')).toBe(true);
      expect(pdfContainsLatin(pdf, 'USD') || pdfContainsCodepoints(pdf, 'USD')).toBe(true);
      expect(pdfContainsLatin(pdf, 'EUR') || pdfContainsCodepoints(pdf, 'EUR')).toBe(true);
      expect(pdfContainsLatin(pdf, 'Transaction history')).toBe(true);
      expect(pdf.verticalRuleCount).toBeGreaterThan(8);
    } finally {
      harness.cleanup();
    }
  });

  it('embeds Noto Naskh and readable Dari text in a Dari customer PDF', async () => {
    const harness = await createCustomerTestHarness();
    try {
      const customer = harness.customerService.create({ name: 'فاطمه', customerNumber: 'C-2' });
      harness.transactionService.create({
        customerId: customer.id,
        type: 'CASH_IN',
        amount: '80',
        currencyCode: 'EUR',
        note: 'سلام AFN 12',
      });

      const generated = await harness.reportsService.generate({
        type: 'customer',
        format: 'pdf',
        language: 'fa-AF',
        customerId: customer.id,
      });
      const pdf = inspectPdf(generated.filePath);
      expect(pdf.isPdf).toBe(true);
      expect(pdf.embedsArabicFont).toBe(true);
      expect(pdfContainsLatin(pdf, 'AFN')).toBe(true);
      expect(pdfContainsLatin(pdf, 'USD')).toBe(true);
      expect(pdfContainsLatin(pdf, 'EUR')).toBe(true);
      expect(pdfContainsLatin(pdf, 'C-2')).toBe(true);
      expect(pdfContainsLatin(pdf, '12')).toBe(true);
      expect(pdfContainsChars(pdf, 'فاطمه')).toBe(true);
      expect(pdfContainsChars(pdf, 'سلام')).toBe(true);

      const shapedGreeting = shapeRtlText('سلام', 'fa-AF');
      expect(containsPresentationForms(shapedGreeting)).toBe(true);
    } finally {
      harness.cleanup();
    }
  });

  it('continues a long transaction table across pages and repeats headers', async () => {
    const harness = await createCustomerTestHarness();
    try {
      const customer = harness.customerService.create({ name: 'Noor', customerNumber: 'N-9' });
      for (let index = 0; index < 40; index += 1) {
        harness.transactionService.create({
          customerId: customer.id,
          type: index % 2 === 0 ? 'CASH_IN' : 'CASH_OUT',
          amount: '10',
          currencyCode: 'AFN',
          note: `Row ${index + 1}`,
        });
      }

      const generated = await harness.reportsService.generate({
        type: 'customer',
        format: 'pdf',
        language: 'en',
        customerId: customer.id,
      });
      const pdf = inspectPdf(generated.filePath);
      expect(pdf.pageCount).toBeGreaterThanOrEqual(2);
      expect(pdfContainsLatin(pdf, 'Transaction history')).toBe(true);
      expect(pdfContainsLatin(pdf, 'Row 40')).toBe(true);
      expect(pdfContainsLatin(pdf, 'Row 1')).toBe(true);
      expect(pdf.verticalRuleCount).toBeGreaterThan(20);
    } finally {
      harness.cleanup();
    }
  });

  it('writes a Pashto customer PDF with embedded Arabic font and Latin currency codes', async () => {
    const harness = await createCustomerTestHarness();
    try {
      const customer = harness.customerService.create({ name: 'احمد', customerNumber: 'P-1' });
      harness.transactionService.create({
        customerId: customer.id,
        type: 'CASH_IN',
        amount: '15',
        currencyCode: 'USD',
        note: 'نغدې 20',
      });
      const generated = await harness.reportsService.generate({
        type: 'customer',
        format: 'pdf',
        language: 'ps',
        customerId: customer.id,
      });
      const pdf = inspectPdf(generated.filePath);
      expect(pdf.isPdf).toBe(true);
      expect(pdf.embedsArabicFont).toBe(true);
      expect(pdfContainsLatin(pdf, 'USD') || pdfContainsCodepoints(pdf, 'USD')).toBe(true);
      expect(pdfContainsLatin(pdf, 'P-1') || pdfContainsCodepoints(pdf, 'P-1')).toBe(true);
      expect(pdfContainsChars(pdf, 'احمد')).toBe(true);
      expect(pdfContainsChars(pdf, 'نغدې')).toBe(true);
    } finally {
      harness.cleanup();
    }
  });

  it('wraps a long note inside the note column and keeps vertical table rules', async () => {
    const harness = await createCustomerTestHarness();
    try {
      const customer = harness.customerService.create({ name: 'احمد خان', customerNumber: 'C-1001' });
      harness.transactionService.create({
        customerId: customer.id,
        type: 'CASH_IN',
        amount: '1500',
        currencyCode: 'AFN',
        transactionDate: '2026-08-22T14:30',
        note: 'این یک یادداشت آزمایشی است که باید داخل ستون یادداشت بماند و ستون مبلغ را خراب نکند. مبلغ پرداخت شد AFN 1500',
      });

      const generated = await harness.reportsService.generate({
        type: 'customer',
        format: 'pdf',
        language: 'fa-AF',
        customerId: customer.id,
      });
      const pdf = inspectPdf(generated.filePath);
      expect(pdfContainsLatin(pdf, 'AFN')).toBe(true);
      expect(pdfContainsLatin(pdf, 'C-1001')).toBe(true);
      expect(pdfContainsLatin(pdf, '1500')).toBe(true);
      expect(pdfContainsChars(pdf, 'احمد خان')).toBe(true);
      expect(pdfContainsChars(pdf, 'مبلغ پرداخت شد')).toBe(true);
      expect(pdfContainsChars(pdf, 'این یک یادداشت آزمایشی است')).toBe(true);
      expect(pdf.verticalRuleCount).toBeGreaterThan(8);
    } finally {
      harness.cleanup();
    }
  });

  it('fails with FONT_MISSING instead of writing a broken Dari PDF', async () => {
    const harness = await createCustomerTestHarness();
    try {
      const customer = harness.customerService.create({ name: 'فاطمه' });
      const emptyFonts = join(harness.testDb.dbPath, '..', 'missing-fonts');
      mkdirSync(emptyFonts, { recursive: true });
      const isolated = new ReportsService({
        customerService: harness.customerService,
        transactionService: harness.transactionService,
        reportsDir: join(harness.testDb.dbPath, '..', 'cache', 'reports-missing'),
        logger: harness.testDb.logger,
        fontsDir: emptyFonts,
      });

      try {
        await isolated.generate({
          type: 'customer',
          format: 'pdf',
          language: 'fa-AF',
          customerId: customer.id,
        });
        expect.fail('expected FONT_MISSING');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe('FONT_MISSING');
      }
    } finally {
      harness.cleanup();
    }
  });
});
