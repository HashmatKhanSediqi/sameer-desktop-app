import { performance } from 'node:perf_hooks';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CustomerRepository } from '../../src/main/database/repositories/customerRepository';
import { TransactionRepository } from '../../src/main/database/repositories/transactionRepository';
import { CurrencyRepository } from '../../src/main/database/repositories/currencyRepository';
import { CustomerService } from '../../src/main/services/customer/customerService';
import { TransactionService } from '../../src/main/services/transaction/transactionService';
import { CustomerPhotoService } from '../../src/main/services/customer/customerPhotoService';
import { applyProjectMigrations, createTestDatabase } from '../helpers/testDatabase';

const CUSTOMER_COUNT = 100_000;
const TRANSACTION_COUNT = 300_000;
const STRESS_TIMEOUT_MS = 10 * 60 * 1000;

function seedLargeDataset(db: import('better-sqlite3').Database): { customerIds: number[] } {
  const insertCustomer = db.prepare('INSERT INTO customers (name, customer_number) VALUES (?, ?)');
  const insertTransaction = db.prepare(
    `INSERT INTO transactions (customer_id, type, currency_code, amount, note, transaction_date)
     VALUES (?, ?, ?, ?, NULL, ?)`,
  );

  const customerIds: number[] = [];
  const seedCustomers = db.transaction(() => {
    for (let index = 0; index < CUSTOMER_COUNT; index += 1) {
      const result = insertCustomer.run(`Customer ${index}`, `C-${index}`);
      customerIds.push(Number(result.lastInsertRowid));
    }
  });
  seedCustomers();

  const currencies = ['AFN', 'USD', 'EUR'];
  const types = ['CASH_IN', 'CASH_OUT'] as const;
  const seedTransactions = db.transaction(() => {
    for (let index = 0; index < TRANSACTION_COUNT; index += 1) {
      const customerId = customerIds[index % customerIds.length]!;
      insertTransaction.run(
        customerId,
        types[index % types.length],
        currencies[index % currencies.length],
        `${((index % 500) + 1).toFixed(4)}`,
        `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
      );
    }
  });
  seedTransactions();

  return { customerIds };
}

describe('large-scale customer and transaction queries', () => {
  it(
    'paginates, searches, and aggregates without loading entire tables into JS',
    () => {
      const testDb = createTestDatabase();
      try {
        applyProjectMigrations(testDb.db, testDb.logger);
        const imagesDir = join(testDb.dbPath, '..', 'images');
        mkdirSync(imagesDir, { recursive: true });
        const customerRepository = new CustomerRepository(testDb.db);
        const transactionRepository = new TransactionRepository(testDb.db);
        const currencyRepository = new CurrencyRepository(testDb.db);
        const photoService = new CustomerPhotoService(imagesDir, testDb.logger);
        const customerService = new CustomerService(testDb.db, photoService, testDb.logger);
        const transactionService = new TransactionService(testDb.db, testDb.logger);

        const seedStarted = performance.now();
        seedLargeDataset(testDb.db);
        const seedMs = performance.now() - seedStarted;

        expect(customerRepository.countCustomers()).toBe(CUSTOMER_COUNT);

        const listStarted = performance.now();
        const firstPage = customerService.listPage(1, 25, (identities) => {
          const accounting = transactionService.getListAccounting(identities.map((item) => item.id));
          return {
            customers: identities.map((identity) => {
              const stats = accounting.get(identity.id) ?? { balances: {}, cashInCount: 0, cashOutCount: 0 };
              return { ...identity, ...stats };
            }),
            totals: transactionService.getGlobalTotals(),
          };
        });
        const listMs = performance.now() - listStarted;

        expect(firstPage.customers).toHaveLength(25);
        expect(firstPage.totalCount).toBe(CUSTOMER_COUNT);
        expect(firstPage.totals.length).toBeGreaterThan(0);

        const searchStarted = performance.now();
        const searchPage = customerService.searchPage('Customer 999', 1, 25, (identities) => ({
          customers: identities.map((identity) => ({
            ...identity,
            balances: {},
            cashInCount: 0,
            cashOutCount: 0,
          })),
          totals: [],
        }));
        const searchMs = performance.now() - searchStarted;

        expect(searchPage.totalCount).toBeGreaterThan(0);
        expect(searchPage.customers.length).toBeLessThanOrEqual(25);

        const historyStarted = performance.now();
        const sampleCustomerId = firstPage.customers[0]!.id;
        const history = transactionService.list({ customerId: sampleCustomerId, page: 1, pageSize: 25 });
        const summary = transactionService.getCustomerSummary(sampleCustomerId);
        const historyMs = performance.now() - historyStarted;

        expect(history.transactions.length).toBeLessThanOrEqual(25);
        expect(summary.currencies.length).toBe(currencyRepository.listActive().length);

        // eslint-disable-next-line no-console
        console.info('[customer-scale]', {
          seedMs: Math.round(seedMs),
          listMs: Math.round(listMs),
          searchMs: Math.round(searchMs),
          historyMs: Math.round(historyMs),
          customers: CUSTOMER_COUNT,
          transactions: TRANSACTION_COUNT,
        });

        expect(listMs).toBeLessThan(5_000);
        expect(searchMs).toBeLessThan(5_000);
        expect(historyMs).toBeLessThan(2_000);
      } finally {
        testDb.cleanup();
      }
    },
    STRESS_TIMEOUT_MS,
  );
});
