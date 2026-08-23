import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { CustomerRepository } from '../../src/main/database/repositories/customerRepository';
import { TransactionRepository } from '../../src/main/database/repositories/transactionRepository';
import {
  buildAccountingMapFromAggregates,
  buildGlobalTotalsFromAggregates,
} from '../../src/main/services/transaction/transactionAggregates';
import { CurrencyRepository } from '../../src/main/database/repositories/currencyRepository';
import { applyProjectMigrations, createTestDatabase } from '../helpers/testDatabase';

describe('transaction SQL aggregates', () => {
  it('matches Decimal.js totals for grouped balances', () => {
    const testDb = createTestDatabase();
    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const customers = new CustomerRepository(testDb.db);
      const transactions = new TransactionRepository(testDb.db);
      const currencies = new CurrencyRepository(testDb.db);

      const customerId = customers.createCustomer({ name: 'Aggregate User', customerNumber: 'A-1' });
      transactions.createTransaction({
        customerId,
        type: 'CASH_IN',
        currencyCode: 'AFN',
        amount: '10.2500',
        note: null,
        transactionDate: '2026-01-01',
      });
      transactions.createTransaction({
        customerId,
        type: 'CASH_IN',
        currencyCode: 'AFN',
        amount: '2.7500',
        note: null,
        transactionDate: '2026-01-02',
      });
      transactions.createTransaction({
        customerId,
        type: 'CASH_OUT',
        currencyCode: 'USD',
        amount: '4.0000',
        note: null,
        transactionDate: '2026-01-03',
      });

      const groups = transactions.aggregateForCustomers([customerId]);
      const active = currencies.listActive();
      const accounting = buildAccountingMapFromAggregates(active, groups, [customerId]);
      const stats = accounting.get(customerId)!;

      expect(stats.balances.AFN).toBe('13.0000');
      expect(stats.balances.USD).toBe('-4.0000');
      expect(stats.cashInCount).toBe(2);
      expect(stats.cashOutCount).toBe(1);

      const globalGroups = transactions.aggregateGlobal();
      const totals = buildGlobalTotalsFromAggregates(active, globalGroups);
      const afn = totals.find((item) => item.currencyCode === 'AFN');
      const usd = totals.find((item) => item.currencyCode === 'USD');
      expect(afn?.balance).toBe('13.0000');
      expect(usd?.balance).toBe('-4.0000');
      expect(new Decimal(afn?.balance ?? '0').plus(usd?.balance ?? '0').toFixed(4)).toBe('9.0000');
    } finally {
      testDb.cleanup();
    }
  });
});

describe('customer pagination repository', () => {
  it('returns only the requested page and accurate counts', () => {
    const testDb = createTestDatabase();
    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const repository = new CustomerRepository(testDb.db);

      for (let index = 0; index < 25; index += 1) {
        repository.createCustomer({
          name: `Customer ${String(index).padStart(2, '0')}`,
          customerNumber: `C-${index}`,
        });
      }

      expect(repository.countCustomers()).toBe(25);
      const page = repository.listCustomersPaginated(10, 0);
      expect(page).toHaveLength(10);
      expect(page[0]?.name).toBe('Customer 24');

      const searchCount = repository.countSearchCustomers('%Customer 0%');
      expect(searchCount).toBeGreaterThan(0);
      const searchPage = repository.searchCustomersPaginated('%Customer 1%', 5, 0);
      expect(searchPage.length).toBeLessThanOrEqual(5);

      expect(repository.countCustomersByExactNumber('C-5')).toBe(1);
      const exactPage = repository.listCustomersByExactNumberPaginated('C-5', 10, 0);
      expect(exactPage).toHaveLength(1);
      expect(exactPage[0]?.customer_number).toBe('C-5');
    } finally {
      testDb.cleanup();
    }
  });
});
