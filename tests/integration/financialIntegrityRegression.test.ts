import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCustomerTestHarness } from '../helpers/customerHarness';
import { TransactionRepository } from '../../src/main/database/repositories/transactionRepository';

describe('financial integrity regression', () => {
  it('remaps transfer groups on repeated imports and isolates deletion and counterparties', async () => {
    const h = await createCustomerTestHarness();
    try {
      const from = h.customerService.create({ name: 'Source' }); const to = h.customerService.create({ name: 'Destination' });
      h.transactionService.create({ customerId: from.id, type: 'CASH_IN', currencyCode: 'AFN', amount: '100' });
      const original = h.transactionService.transfer({ fromCustomerId: from.id, toCustomerId: to.id, currencyCode: 'AFN', amount: '10' });
      const file = join(h.ctx.paths.backups, 'transfer.cab'); await h.backupService.create(file);
      await h.backupService.restore(file, true); await h.backupService.restore(file, true);
      const rows = h.testDb.db.prepare('SELECT transfer_id, customer_id, counterparty_customer_id FROM transactions WHERE transfer_id IS NOT NULL').all() as Array<{ transfer_id: string; customer_id: number; counterparty_customer_id: number }>;
      const ids = [...new Set(rows.map(row => row.transfer_id))]; expect(ids).toHaveLength(3);
      for (const id of ids) {
        const legs = rows.filter(row => row.transfer_id === id); expect(legs).toHaveLength(2);
        expect(legs[0]!.customer_id).toBe(legs[1]!.counterparty_customer_id);
        expect(legs[1]!.customer_id).toBe(legs[0]!.counterparty_customer_id);
        if (id !== original.transferId) expect(legs.every(row => row.customer_id !== from.id && row.customer_id !== to.id)).toBe(true);
      }
      const repository = new TransactionRepository(h.testDb.db);
      expect(repository.deleteByTransferId(ids[1]!)).toBe(2);
      expect(repository.deleteByTransferId(original.transferId)).toBe(2);
      expect(h.testDb.db.prepare('SELECT COUNT(*) AS count FROM transactions WHERE transfer_id = ?').get(ids[2])).toEqual({ count: 2 });
    } finally { h.cleanup(); }
  });

  it.each([
    [['0.1', '0.2'], [], '0.3000'],
    [['0.0001', '0.0002'], [], '0.0003'],
    [['1000000000000.0001'], ['1000000000000.0000'], '0.0001'],
    [['9999999999999999.9999', '0.0001'], [], '10000000000000000.0000'],
    [['0.1'], ['0.2'], '-0.1000'],
  ] as const)('computes exact balances and report totals for %j minus %j', async (incoming, outgoing, expected) => {
    const h = await createCustomerTestHarness();
    try {
      const customer = h.customerService.create({ name: 'Exact' });
      for (const amount of incoming) h.transactionService.create({ customerId: customer.id, type: 'CASH_IN', currencyCode: 'AFN', amount });
      for (const amount of outgoing) h.transactionService.create({ customerId: customer.id, type: 'CASH_OUT', currencyCode: 'AFN', amount });
      h.transactionService.create({ customerId: customer.id, type: 'CASH_IN', currencyCode: 'USD', amount: '7.0001' });
      const summary = h.transactionService.getCustomerSummary(customer.id);
      expect(summary.currencies.find(row => row.currencyCode === 'AFN')?.balance).toBe(expected);
      expect(summary.currencies.find(row => row.currencyCode === 'USD')?.balance).toBe('7.0001');
      for (const type of ['customer', 'all_customers', 'currency_summary', 'transactions', 'date_range'] as const) {
        const model = h.reportsService.buildModel({ type, customerId: customer.id, format: 'xlsx', language: 'en' });
        expect(model.currencySummaries.find(row => row.currencyCode === 'AFN')?.balance).toBe(expected);
      }
    } finally { h.cleanup(); }
  });

  it('sums 100,000 fractional transactions exactly and enforces the transfer boundary', async () => {
    const h = await createCustomerTestHarness();
    try {
      const from = h.customerService.create({ name: 'Exact source' }); const to = h.customerService.create({ name: 'Exact destination' });
      const insert = h.testDb.db.prepare("INSERT INTO transactions(customer_id,type,currency_code,amount,transaction_date) VALUES (?,'CASH_IN','AFN','0.0001','2026-09-05')");
      h.testDb.db.transaction(() => { for (let index = 0; index < 100000; index++) insert.run(from.id); })();
      expect(h.transactionService.getCustomerSummary(from.id).currencies.find(row => row.currencyCode === 'AFN')?.balance).toBe('10.0000');
      expect(() => h.transactionService.transfer({ fromCustomerId: from.id, toCustomerId: to.id, currencyCode: 'AFN', amount: '10.0001' })).toThrow('INSUFFICIENT_BALANCE');
      h.transactionService.transfer({ fromCustomerId: from.id, toCustomerId: to.id, currencyCode: 'AFN', amount: '9.9999' });
      expect(h.transactionService.getCustomerSummary(from.id).currencies.find(row => row.currencyCode === 'AFN')?.balance).toBe('0.0001');
      h.transactionService.transfer({ fromCustomerId: from.id, toCustomerId: to.id, currencyCode: 'AFN', amount: '0.0001' });
      expect(h.transactionService.getCustomerSummary(from.id).currencies.find(row => row.currencyCode === 'AFN')?.balance).toBe('0.0000');
    } finally { h.cleanup(); }
  });

  it('retains active denomination counts through retirement, export, future configuration and independent currencies', async () => {
    const h = await createCustomerTestHarness();
    try {
      const teller = h.ctx.tellerService; const accounting = h.ctx.currencyService; const configuration = h.ctx.tellerCurrencyService;
      accounting.create({ code: 'GBP' }); accounting.deactivate('AFN');
      expect(configuration.listAll().some(row => row.code === 'GBP')).toBe(false);
      configuration.create({ code: 'PKR' }); configuration.createDenomination({ currencyCode: 'PKR', value: '100' });
      expect(accounting.listAll().some(row => row.code === 'PKR')).toBe(false);
      const sheets = teller.startDay(1); expect(sheets.map(sheet => sheet.currencyCode)).not.toContain('GBP');
      const afn = sheets.find(sheet => sheet.currencyCode === 'AFN')!;
      teller.upsertTransaction(1, { sessionId: afn.session!.id, direction: 'DEPOSIT', worksheetRow: 4, declaredAmount: null, denominationCounts: { '1000': 2 } });
      const denomination = configuration.listDenominations('AFN').find(row => row.value === '1000')!;
      configuration.deactivateDenomination(denomination.id);
      const refreshed = teller.getSheet('AFN', { userId: 1 });
      expect(refreshed.deposits[0]?.countedTotal).toBe('2000.0000');
      expect(refreshed.denominations.some(row => row.id === denomination.id)).toBe(true);
      const ending = teller.endDay(1, join(h.ctx.paths.backups, 'day.xlsx'));
      expect(() => teller.upsertTransaction(1, { sessionId: afn.session!.id, direction: 'DEPOSIT', worksheetRow: 4, declaredAmount: '1', denominationCounts: {} })).toThrow();
      const result = await ending;
      expect(result.closings.find(row => row.currencyCode === 'AFN')?.closingAmount).toBe('2000.0000');
      const next = teller.startDay(1).find(sheet => sheet.currencyCode === 'AFN')!;
      expect(next.session?.openingAmount).toBe('2000.0000');
      expect(next.denominations.some(row => row.id === denomination.id)).toBe(false);
      expect(h.testDb.db.prepare('SELECT COUNT(*) AS count FROM transactions').get()).toEqual({ count: 0 });
    } finally { h.cleanup(); }
  });
});
