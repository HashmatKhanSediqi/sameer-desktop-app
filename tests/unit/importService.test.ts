import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeImportWorkbook } from '../helpers/importWorkbook';
import { createCustomerTestHarness } from '../helpers/customerHarness';

describe('import service', () => {
  it('imports a valid workbook after preview', async () => {
    const harness = await createCustomerTestHarness();
    try {
      const filePath = join(harness.testDb.dbPath, '..', 'valid-import.xlsx');
      await writeImportWorkbook(filePath, {
        customers: [['C-001', 'Ahmad Khan', '']],
        transactions: [
          ['C-001', 'Ahmad Khan', 'CASH_IN', 'AFN', '50000', '2025-01-15', 'Initial deposit'],
          ['C-001', 'Ahmad Khan', 'CASH_OUT', 'AFN', '10000', '2025-02-01', 'Payment'],
        ],
      });

      const parsed = await harness.importService.parseFile(filePath, 'en', 'session-1');
      expect(parsed.success).toBe(true);
      expect(parsed.summary.validCount).toBe(3);
      expect(parsed.errors).toHaveLength(0);

      const committed = harness.importService.commit(
        'session-1',
        parsed.validCustomers,
        parsed.validTransactions,
        'en',
      );
      expect(committed.customersCreated).toBe(1);
      expect(committed.transactionsImported).toBe(2);

      const customers = harness.customerService.list();
      expect(customers).toHaveLength(1);
      expect(customers[0]?.customerNumber).toBe('C-001');
    } finally {
      harness.cleanup();
    }
  });

  it('auto-creates missing customers and matches existing numbers', async () => {
    const harness = await createCustomerTestHarness();
    try {
      harness.customerService.create({ name: 'Existing', customerNumber: 'C-100' });
      const filePath = join(harness.testDb.dbPath, '..', 'match-import.xlsx');
      await writeImportWorkbook(filePath, {
        transactions: [
          ['C-100', 'Existing', 'CASH_IN', 'USD', '40', '2025-01-01', ''],
          ['', 'Guest User', 'CASH_IN', 'EUR', '15', '', ''],
        ],
      });

      const parsed = await harness.importService.parseFile(filePath, 'en', 'session-2');
      const committed = harness.importService.commit(
        'session-2',
        parsed.validCustomers,
        parsed.validTransactions,
        'en',
      );
      expect(committed.customersMatched).toBe(1);
      expect(committed.customersCreated).toBe(1);
      expect(committed.transactionsImported).toBe(2);
      expect(harness.customerService.list()).toHaveLength(2);
    } finally {
      harness.cleanup();
    }
  });

  it('does not change the database when commit is skipped after preview', async () => {
    const harness = await createCustomerTestHarness();
    try {
      const filePath = join(harness.testDb.dbPath, '..', 'cancel.xlsx');
      await writeImportWorkbook(filePath, {
        transactions: [['C-200', 'Cancel User', 'CASH_IN', 'AFN', '10', '2025-01-01', '']],
      });
      await harness.importService.parseFile(filePath, 'en', 'session-3');
      expect(harness.customerService.list()).toHaveLength(0);
    } finally {
      harness.cleanup();
    }
  });

  it('rolls back the entire commit when a later insert fails', async () => {
    const harness = await createCustomerTestHarness();
    try {
      const filePath = join(harness.testDb.dbPath, '..', 'rollback.xlsx');
      await writeImportWorkbook(filePath, {
        transactions: [
          ['C-301', 'One', 'CASH_IN', 'AFN', '10', '2025-01-01', ''],
          ['C-302', 'Two', 'CASH_IN', 'USD', '20', '2025-01-02', ''],
        ],
      });
      const parsed = await harness.importService.parseFile(filePath, 'en', 'session-4');
      expect(parsed.validTransactions).toHaveLength(2);

      harness.testDb.db.exec(`
        CREATE TRIGGER fail_second_import AFTER INSERT ON transactions
        WHEN (SELECT COUNT(*) FROM transactions) >= 2
        BEGIN
          SELECT RAISE(ABORT, 'forced import failure');
        END;
      `);

      expect(() =>
        harness.importService.commit('session-4', parsed.validCustomers, parsed.validTransactions, 'en'),
      ).toThrow();

      expect(harness.customerService.list()).toHaveLength(0);
      const count = harness.testDb.db.prepare('SELECT COUNT(*) AS count FROM transactions').get() as {
        count: number;
      };
      expect(count.count).toBe(0);
    } finally {
      harness.cleanup();
    }
  });

  it('flags duplicate customer numbers in the Customers sheet', async () => {
    const harness = await createCustomerTestHarness();
    try {
      const filePath = join(harness.testDb.dbPath, '..', 'dup-customer.xlsx');
      await writeImportWorkbook(filePath, {
        customers: [
          ['C-400', 'First', ''],
          ['C-400', 'Second', ''],
        ],
        includeTransactionsSheet: false,
      });
      const parsed = await harness.importService.parseFile(filePath, 'en', 'session-5');
      expect(parsed.errors.some((error) => error.code === 'DUPLICATE_CUSTOMER')).toBe(true);
      expect(parsed.validCustomers).toHaveLength(1);
    } finally {
      harness.cleanup();
    }
  });

  it('warns about possible duplicate transactions but still imports them', async () => {
    const harness = await createCustomerTestHarness();
    try {
      const created = harness.customerService.create({ name: 'Dup', customerNumber: 'C-500' });
      harness.transactionService.create({
        customerId: created.id,
        type: 'CASH_IN',
        amount: '33',
        currencyCode: 'AFN',
        transactionDate: '2025-05-05',
        note: 'existing',
      });

      const filePath = join(harness.testDb.dbPath, '..', 'dup-txn.xlsx');
      await writeImportWorkbook(filePath, {
        transactions: [['C-500', 'Dup', 'CASH_IN', 'AFN', '33', '2025-05-05', 'again']],
      });
      const parsed = await harness.importService.parseFile(filePath, 'en', 'session-6');
      expect(parsed.warnings.some((warning) => warning.code === 'POSSIBLE_DUPLICATE')).toBe(true);
      const committed = harness.importService.commit(
        'session-6',
        parsed.validCustomers,
        parsed.validTransactions,
        'en',
      );
      expect(committed.transactionsImported).toBe(1);
    } finally {
      harness.cleanup();
    }
  });

  it('rejects a tampered commit payload without inserting data', async () => {
    const harness = await createCustomerTestHarness();
    try {
      expect(() =>
        harness.importService.commit(
          'missing-session',
          [],
          [
            {
              row: 2,
              customerNumber: 'C-900',
              customerName: 'Bad',
              type: 'CASH_IN',
              currencyCode: 'XXX',
              amount: '10',
              transactionDate: '2025-01-01 00:00:00',
              note: null,
            },
          ],
          'en',
        ),
      ).toThrow();
      expect(harness.customerService.list()).toHaveLength(0);
    } finally {
      harness.cleanup();
    }
  });

  it('stores a suspicious customer name as data rather than executing SQL', async () => {
    const harness = await createCustomerTestHarness();
    try {
      const filePath = join(harness.testDb.dbPath, '..', 'sqli.xlsx');
      await writeImportWorkbook(filePath, {
        transactions: [
          ['C-SQL', "Robert'); DROP TABLE customers;--", 'CASH_IN', 'AFN', '1', '2025-01-01', ''],
        ],
      });
      const parsed = await harness.importService.parseFile(filePath, 'en', 'session-sql');
      harness.importService.commit('session-sql', parsed.validCustomers, parsed.validTransactions, 'en');
      expect(harness.customerService.list()).toHaveLength(1);
      expect(harness.customerService.list()[0]?.name).toContain('DROP TABLE');
    } finally {
      harness.cleanup();
    }
  });
});
