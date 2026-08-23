import { describe, expect, it } from 'vitest';
import { TransactionRepository } from '../../src/main/database/repositories/transactionRepository';
import { createCustomerTestHarness } from '../helpers/customerHarness';

describe('customer transfers', () => {
  it('transfers atomically through the ledger and updates both histories', async () => {
    const harness = await createCustomerTestHarness();
    try {
      const source = harness.customerService.create({ name: 'Customer A' });
      const destination = harness.customerService.create({ name: 'Customer B' });
      harness.transactionService.create({
        customerId: source.id,
        type: 'CASH_IN',
        amount: '10000',
        currencyCode: 'AFN',
      });

      const result = harness.transactionService.transfer({
        fromCustomerId: source.id,
        toCustomerId: destination.id,
        amount: '2000',
        currencyCode: 'AFN',
        note: 'Payment transfer',
      });

      expect(result.transferId.length).toBeGreaterThan(0);
      expect(harness.transactionService.getCustomerSummary(source.id).currencies.find((item) => item.currencyCode === 'AFN')?.balance).toBe(
        '8000.0000',
      );
      expect(
        harness.transactionService.getCustomerSummary(destination.id).currencies.find((item) => item.currencyCode === 'AFN')?.balance,
      ).toBe('2000.0000');

      const sourceHistory = harness.transactionService.list({ customerId: source.id, page: 1, pageSize: 10 });
      const destHistory = harness.transactionService.list({ customerId: destination.id, page: 1, pageSize: 10 });
      const outLeg = sourceHistory.transactions.find((row) => row.transferId === result.transferId);
      const inLeg = destHistory.transactions.find((row) => row.transferId === result.transferId);
      expect(outLeg?.type).toBe('CASH_OUT');
      expect(outLeg?.transferRole).toBe('OUT');
      expect(outLeg?.counterpartyName).toBe('Customer B');
      expect(inLeg?.type).toBe('CASH_IN');
      expect(inLeg?.transferRole).toBe('IN');
      expect(inLeg?.counterpartyName).toBe('Customer A');
    } finally {
      harness.cleanup();
    }
  });

  it('rejects insufficient balance, same customer, missing customer, and invalid amount', async () => {
    const harness = await createCustomerTestHarness();
    try {
      const source = harness.customerService.create({ name: 'Customer A' });
      const destination = harness.customerService.create({ name: 'Customer B' });
      harness.transactionService.create({
        customerId: source.id,
        type: 'CASH_IN',
        amount: '50',
        currencyCode: 'USD',
      });

      expect(() =>
        harness.transactionService.transfer({
          fromCustomerId: source.id,
          toCustomerId: destination.id,
          amount: '50.01',
          currencyCode: 'USD',
        }),
      ).toThrowError(/INSUFFICIENT_BALANCE/);

      expect(() =>
        harness.transactionService.transfer({
          fromCustomerId: source.id,
          toCustomerId: source.id,
          amount: '10',
          currencyCode: 'USD',
        }),
      ).toThrowError(/TRANSFER_SAME_CUSTOMER/);

      expect(() =>
        harness.transactionService.transfer({
          fromCustomerId: 99999,
          toCustomerId: destination.id,
          amount: '10',
          currencyCode: 'USD',
        }),
      ).toThrowError(/CUSTOMER_NOT_FOUND/);

      expect(() =>
        harness.transactionService.transfer({
          fromCustomerId: source.id,
          toCustomerId: destination.id,
          amount: '-10',
          currencyCode: 'USD',
        }),
      ).toThrowError(/AMOUNT_INVALID|AMOUNT_REQUIRED/);
    } finally {
      harness.cleanup();
    }
  });

  it('keeps currencies independent and rolls back both legs when the pair insert fails', async () => {
    const harness = await createCustomerTestHarness();
    try {
      const source = harness.customerService.create({ name: 'Customer A' });
      const destination = harness.customerService.create({ name: 'Customer B' });
      harness.transactionService.create({
        customerId: source.id,
        type: 'CASH_IN',
        amount: '100',
        currencyCode: 'AFN',
      });
      harness.transactionService.create({
        customerId: source.id,
        type: 'CASH_IN',
        amount: '25',
        currencyCode: 'USD',
      });

      harness.transactionService.transfer({
        fromCustomerId: source.id,
        toCustomerId: destination.id,
        amount: '10',
        currencyCode: 'AFN',
      });
      expect(harness.transactionService.getCustomerSummary(source.id).currencies.find((item) => item.currencyCode === 'USD')?.balance).toBe(
        '25.0000',
      );

      const repository = new TransactionRepository(harness.testDb.db);
      const beforeCount = harness.testDb.db.prepare('SELECT COUNT(*) AS count FROM transactions').get() as { count: number };
      expect(() =>
        repository.createTransferPair(
          {
            customerId: source.id,
            type: 'CASH_OUT',
            currencyCode: 'AFN',
            amount: '5',
            note: null,
            transactionDate: '2026-01-01 00:00:00',
            transferId: 'rollback-test',
            transferRole: 'OUT',
            counterpartyCustomerId: destination.id,
          },
          {
            customerId: 99999,
            type: 'CASH_IN',
            currencyCode: 'AFN',
            amount: '5',
            note: null,
            transactionDate: '2026-01-01 00:00:00',
            transferId: 'rollback-test',
            transferRole: 'IN',
            counterpartyCustomerId: source.id,
          },
        ),
      ).toThrow();
      const afterCount = harness.testDb.db.prepare('SELECT COUNT(*) AS count FROM transactions').get() as { count: number };
      expect(afterCount.count).toBe(beforeCount.count);
      expect(
        harness.testDb.db.prepare('SELECT COUNT(*) AS count FROM transactions WHERE transfer_id = ?').get('rollback-test'),
      ).toEqual({ count: 0 });
    } finally {
      harness.cleanup();
    }
  });

  it('does not allow editing a transfer leg', async () => {
    const harness = await createCustomerTestHarness();
    try {
      const source = harness.customerService.create({ name: 'Customer A' });
      const destination = harness.customerService.create({ name: 'Customer B' });
      harness.transactionService.create({
        customerId: source.id,
        type: 'CASH_IN',
        amount: '100',
        currencyCode: 'AFN',
      });
      const transfer = harness.transactionService.transfer({
        fromCustomerId: source.id,
        toCustomerId: destination.id,
        amount: '10',
        currencyCode: 'AFN',
      });
      expect(() =>
        harness.transactionService.update({
          id: transfer.outTransactionId,
          type: 'CASH_OUT',
          amount: '11',
          currencyCode: 'AFN',
        }),
      ).toThrowError(/TRANSFER_IMMUTABLE/);
    } finally {
      harness.cleanup();
    }
  });
});
