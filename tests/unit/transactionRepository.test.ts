import { describe, expect, it } from 'vitest';
import { TransactionRepository } from '../../src/main/database/repositories/transactionRepository';
import { applyProjectMigrations, createTestDatabase } from '../helpers/testDatabase';

describe('TransactionRepository', () => {
  it('creates, retrieves, lists, updates, and deletes transactions for a customer', () => {
    const testDb = createTestDatabase();

    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const customerId = Number(
        testDb.db.prepare('INSERT INTO customers (name) VALUES (?)').run('Ahmad').lastInsertRowid,
      );
      const repository = new TransactionRepository(testDb.db);

      const cashInId = repository.createTransaction({
        customerId,
        type: 'CASH_IN',
        currencyCode: 'AFN',
        amount: '1000',
        note: null,
        transactionDate: '2026-01-01 10:00:00',
      });
      const cashOutId = repository.createTransaction({
        customerId,
        type: 'CASH_OUT',
        currencyCode: 'AFN',
        amount: '300',
        note: 'paid',
        transactionDate: '2026-01-02 10:00:00',
      });

      expect(repository.getTransactionById(cashInId)?.type).toBe('CASH_IN');
      const listed = repository.listByCustomer(customerId, 10, 0);
      expect(listed.map((row) => row.id)).toEqual([cashOutId, cashInId]);

      repository.updateTransaction(cashOutId, {
        type: 'CASH_OUT',
        currencyCode: 'USD',
        amount: '50',
        note: 'updated',
        transactionDate: '2026-01-03 00:00:00',
      });
      expect(repository.getTransactionById(cashOutId)?.currency_code).toBe('USD');
      expect(repository.getTransactionById(cashOutId)?.updated_at).not.toBe(
        repository.getTransactionById(cashOutId)?.created_at,
      );

      expect(repository.deleteTransaction(cashOutId)).toBe(true);
      expect(repository.getTransactionById(cashOutId)).toBeUndefined();
      expect(repository.countByCustomer(customerId)).toBe(1);
    } finally {
      testDb.cleanup();
    }
  });

  it('stores SQL-like notes safely via parameterized queries', () => {
    const testDb = createTestDatabase();

    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const customerId = Number(
        testDb.db.prepare('INSERT INTO customers (name) VALUES (?)').run('Ahmad').lastInsertRowid,
      );
      const repository = new TransactionRepository(testDb.db);
      const payload = "'; DROP TABLE transactions; --";
      const id = repository.createTransaction({
        customerId,
        type: 'CASH_IN',
        currencyCode: 'AFN',
        amount: '1',
        note: payload,
        transactionDate: '2026-01-01 00:00:00',
      });

      expect(repository.getTransactionById(id)?.note).toBe(payload);
      const table = testDb.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'transactions'")
        .get();
      expect(table).toBeTruthy();
    } finally {
      testDb.cleanup();
    }
  });
});
