import { describe, expect, it } from 'vitest';
import { calculateFromAmount, calculateToAmount } from '../../src/shared/exchange';
import { createCustomerTestHarness } from '../helpers/customerHarness';

const requestId = '11111111-1111-4111-8111-111111111111';

describe('customer currency exchange', () => {
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
      const rows = h.transactionService.list({ customerId: customer.id, page: 1, pageSize: 20 }).transactions.filter(r => r.exchangeId === first.exchangeId);
      expect(rows).toHaveLength(2);
      expect(new Set(rows.map(r => r.exchangeRole))).toEqual(new Set(['SOLD', 'BOUGHT']));
      expect(rows.every(r => r.exchangeRate === '70' && r.note === 'counter 4')).toBe(true);
      const summary = h.transactionService.getCustomerSummary(customer.id);
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
      h.transactionService.delete(fx.boughtTransactionId);
      expect(h.testDb.db.prepare('SELECT COUNT(*) count FROM transactions WHERE exchange_id=?').get(fx.exchangeId)).toEqual({ count: 0 });
    } finally { h.cleanup(); }
  });

  it('includes both sides, rate, commission and note in report data', async () => {
    const h = await createCustomerTestHarness();
    try {
      const c = h.customerService.create({ name: 'Report FX' });
      h.transactionService.create({ customerId: c.id, type: 'CASH_IN', amount: '7100', currencyCode: 'AFN' });
      h.transactionService.exchange({ customerId: c.id, fromCurrency: 'AFN', fromAmount: '7000', toCurrency: 'USD', toAmount: '100.0000', rate: '70', commissionCurrency: 'AFN', commissionAmount: '100', note: 'receipt 9', requestId });
      const model = h.reportsService.buildModel({ type: 'customer', format: 'xlsx', language: 'en', customerId: c.id });
      const exchangeRows = model.transactions.filter(row => row.typeLabel.startsWith('Exchange'));
      expect(exchangeRows).toHaveLength(2);
      expect(exchangeRows.every(row => row.typeLabel.includes('7000.0000 AFN') && row.typeLabel.includes('100.0000 USD') && row.typeLabel.includes('70') && row.typeLabel.includes('Commission 100.0000 AFN'))).toBe(true);
      expect(exchangeRows.every(row => row.note === 'receipt 9')).toBe(true);
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
