import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { calculateFromAmount, calculateToAmount } from '../../src/shared/exchange';
import { createCustomerTestHarness } from '../helpers/customerHarness';
import { inspectPdf, pdfContainsLatin } from '../helpers/pdfInspect';

const requestId = '11111111-1111-4111-8111-111111111111';

describe('customer currency exchange', () => {
  it('stores a very large exchange exactly', async () => {
    const h = await createCustomerTestHarness();
    try {
      const customer = h.customerService.create({ name: 'Large exchange' });
      h.transactionService.create({ customerId: customer.id, type: 'CASH_IN', currencyCode: 'AFN', amount: '99999999999999999999' });

      const result = h.transactionService.exchange({
        customerId: customer.id,
        fromCurrency: 'AFN',
        fromAmount: '23923842934829348234.1234',
        toCurrency: 'USD',
        toAmount: '23923842934829348234.1234',
        rate: '1',
        requestId: '22222222-2222-4222-8222-222222222222',
      });

      expect(h.transactionService.getById(result.soldTransactionId).amount).toBe('23923842934829348234.1234');
      expect(h.transactionService.getById(result.boughtTransactionId).amount).toBe('23923842934829348234.1234');
    } finally {
      h.cleanup();
    }
  });

  it('calculates both directions using 1 destination = rate source', () => {
    expect(calculateToAmount('10000', '70')).toBe('142.8571');
    expect(calculateFromAmount('1000', '70')).toBe('70000.0000');
    expect(calculateToAmount('10', '0.3')).toBe('33.3333');
  });

  it('posts two grouped exact legs and is idempotent', async () => {
    const h = await createCustomerTestHarness();
    try {
      const customer = h.customerService.create({ name: 'FX customer' });
      h.transactionService.create({ customerId: customer.id, type: 'CASH_IN', amount: '10100', currencyCode: 'AFN' });
      const input = { customerId: customer.id, fromCurrency: 'AFN', fromAmount: '10000', toCurrency: 'USD',
        toAmount: '142.8571', rate: '70', commissionCurrency: 'AFN', commissionAmount: '100', note: 'counter 4', requestId };
      const first = h.transactionService.exchange(input);
      const second = h.transactionService.exchange(input);
      expect(first.exchangeId).toBe(second.exchangeId);
      expect(second.duplicate).toBe(true);
      const history = h.transactionService.list({ customerId: customer.id, page: 1, pageSize: 20 });
      expect(history.transactions).toHaveLength(1);
      expect(history.transactions.every((row) => row.exchangeId === null)).toBe(true);
      expect(history.exchanges).toHaveLength(1);
      expect(history.exchanges[0]).toMatchObject({ exchangeId: first.exchangeId, fromCurrency: 'AFN',
        fromAmount: '10000.0000', toCurrency: 'USD', toAmount: '142.8571', rate: '70',
        commissionCurrency: 'AFN', commissionAmount: '100.0000', note: 'counter 4' });
      const summary = h.transactionService.getCustomerSummary(customer.id);
      expect(summary.cashInCount).toBe(1);
      expect(summary.cashOutCount).toBe(0);
      expect(summary.currencies.find(c => c.currencyCode === 'AFN')).toMatchObject({ cashInTotal: '10100.0000', cashOutTotal: '0.0000', cashInCount: 1, cashOutCount: 0 });
      expect(summary.currencies.find(c => c.currencyCode === 'AFN')?.balance).toBe('0.0000');
      expect(summary.currencies.find(c => c.currencyCode === 'USD')?.balance).toBe('142.8571');
    } finally { h.cleanup(); }
  });

  it('accounts destination commission and deletes both legs together', async () => {
    const h = await createCustomerTestHarness();
    try {
      const c = h.customerService.create({ name: 'FX' });
      h.transactionService.create({ customerId: c.id, type: 'CASH_IN', amount: '10000', currencyCode: 'AFN' });
      const fx = h.transactionService.exchange({ customerId: c.id, fromCurrency: 'AFN', fromAmount: '7000', toCurrency: 'USD', toAmount: '100.0000', rate: '70', commissionCurrency: 'USD', commissionAmount: '2', requestId });
      expect(h.transactionService.getCustomerSummary(c.id).currencies.find(x => x.currencyCode === 'USD')?.balance).toBe('98.0000');
      expect(() => h.transactionService.update({ id: fx.soldTransactionId, type: 'CASH_OUT', currencyCode: 'AFN', amount: '1' })).toThrow(/EXCHANGE_IMMUTABLE/);
      const grouped = h.transactionService.list({ customerId: c.id }).exchanges;
      expect(grouped).toHaveLength(1);
      h.transactionService.delete(grouped[0]!.transactionId);
      expect(h.testDb.db.prepare('SELECT COUNT(*) count FROM transactions WHERE exchange_id=?').get(fx.exchangeId)).toEqual({ count: 0 });
    } finally { h.cleanup(); }
  });

  it('includes both sides, rate, commission and note in report data', async () => {
    const h = await createCustomerTestHarness();
    try {
      const c = h.customerService.create({ name: 'Report FX' });
      h.transactionService.create({ customerId: c.id, type: 'CASH_IN', amount: '7100', currencyCode: 'AFN' });
      h.transactionService.exchange({ customerId: c.id, fromCurrency: 'AFN', fromAmount: '7000', toCurrency: 'USD', toAmount: '100.0000', rate: '70', commissionCurrency: 'AFN', commissionAmount: '100', note: 'receipt 9', requestId });
      const without = h.reportsService.buildModel({ type: 'customer', format: 'xlsx', language: 'en', customerId: c.id });
      expect(without.transactions.every((row) => !row.typeLabel.startsWith('Exchange'))).toBe(true);
      expect(without.exchanges).toHaveLength(0);
      expect(without.currencySummaries.find((row) => row.currencyCode === 'AFN')?.balance).toBe('0.0000');
      const model = h.reportsService.buildModel({ type: 'customer', format: 'xlsx', language: 'en', customerId: c.id, includeExchanges: true });
      expect(model.exchanges).toHaveLength(1);
      expect(model.exchanges[0]).toMatchObject({ fromAmount: '7000.0000', fromCurrency: 'AFN', toAmount: '100.0000',
        toCurrency: 'USD', rate: '70', commissionAmount: '100.0000', commissionCurrency: 'AFN', note: 'receipt 9' });

      const excel = await h.reportsService.generate({ type: 'customer', format: 'xlsx', language: 'en', customerId: c.id, includeExchanges: true });
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(excel.filePath);
      expect(workbook.worksheets).toHaveLength(2);
      expect(workbook.worksheets[1]!.name).toBe('Currency Exchanges');
      const exchangeValues = workbook.worksheets[1]!.getSheetValues().flat().filter((value): value is string => typeof value === 'string');
      expect(exchangeValues).toEqual(expect.arrayContaining(['7000.0000', '100.0000', '70', 'AFN', 'receipt 9']));

      const pdf = await h.reportsService.generate({ type: 'customer', format: 'pdf', language: 'en', customerId: c.id, includeExchanges: true });
      const inspected = inspectPdf(pdf.filePath);
      expect(pdfContainsLatin(inspected, 'Currency Exchanges')).toBe(true);
      expect(pdfContainsLatin(inspected, 'receipt 9')).toBe(true);
    } finally { h.cleanup(); }
  });

  it('rejects invalid currencies, amounts, rates, commission and insufficient balance without partial rows', async () => {
    const h = await createCustomerTestHarness();
    try {
      const c = h.customerService.create({ name: 'FX' });
      h.transactionService.create({ customerId: c.id, type: 'CASH_IN', amount: '5', currencyCode: 'AFN' });
      const base = { customerId: c.id, fromCurrency: 'AFN', fromAmount: '10', toCurrency: 'USD', toAmount: '0.1429', rate: '70', requestId };
      expect(() => h.transactionService.exchange(base)).toThrow(/INSUFFICIENT_BALANCE/);
      expect(() => h.transactionService.exchange({ ...base, toCurrency: 'AFN' })).toThrow(/EXCHANGE_SAME_CURRENCY/);
      expect(() => h.transactionService.exchange({ ...base, rate: '0' })).toThrow(/AMOUNT/);
      expect(() => h.transactionService.exchange({ ...base, commissionAmount: 'x', commissionCurrency: 'AFN' })).toThrow(/COMMISSION_INVALID/);
      expect(() => h.transactionService.exchange({ ...base, toCurrency: 'ZZZ' })).toThrow(/CURRENCY/);
      expect(h.testDb.db.prepare('SELECT COUNT(*) count FROM transactions WHERE exchange_id IS NOT NULL').get()).toEqual({ count: 0 });
    } finally { h.cleanup(); }
  });
});
