import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/main/utils/errors';
import { createCustomerTestHarness } from '../helpers/customerHarness';

describe('TransactionService', () => {
  it('records cash in and cash out and computes the documented AFN balance sequence', async () => {
    const harness = await createCustomerTestHarness();

    try {
      const customer = harness.customerService.create({ name: 'Ahmad' });
      harness.transactionService.create({
        customerId: customer.id,
        type: 'CASH_IN',
        amount: '1000',
        currencyCode: 'AFN',
      });
      harness.transactionService.create({
        customerId: customer.id,
        type: 'CASH_OUT',
        amount: '300',
        currencyCode: 'AFN',
      });
      harness.transactionService.create({
        customerId: customer.id,
        type: 'CASH_IN',
        amount: '500',
        currencyCode: 'AFN',
      });
      harness.transactionService.create({
        customerId: customer.id,
        type: 'CASH_OUT',
        amount: '200',
        currencyCode: 'AFN',
      });

      const summary = harness.transactionService.getCustomerSummary(customer.id);
      const afn = summary.currencies.find((item) => item.currencyCode === 'AFN');
      expect(afn?.balance).toBe('1000.0000');
      expect(afn?.cashInTotal).toBe('1500.0000');
      expect(afn?.cashOutTotal).toBe('500.0000');
      expect(summary.currencies.find((item) => item.currencyCode === 'USD')?.balance).toBe('0.0000');
    } finally {
      harness.cleanup();
    }
  });

  it('allows a negative balance when cash out exceeds cash in and keeps currencies independent', async () => {
    const harness = await createCustomerTestHarness();

    try {
      const customer = harness.customerService.create({ name: 'Ahmad' });
      harness.transactionService.create({
        customerId: customer.id,
        type: 'CASH_OUT',
        amount: '75.5',
        currencyCode: 'USD',
      });
      harness.transactionService.create({
        customerId: customer.id,
        type: 'CASH_IN',
        amount: '10',
        currencyCode: 'EUR',
      });

      const summary = harness.transactionService.getCustomerSummary(customer.id);
      expect(summary.currencies.find((item) => item.currencyCode === 'USD')?.balance).toBe('-75.5000');
      expect(summary.currencies.find((item) => item.currencyCode === 'EUR')?.balance).toBe('10.0000');
      expect(summary.currencies.find((item) => item.currencyCode === 'AFN')?.balance).toBe('0.0000');
    } finally {
      harness.cleanup();
    }
  });

  it('rejects invalid types, amounts, currencies, and missing customers', async () => {
    const harness = await createCustomerTestHarness();

    try {
      const customer = harness.customerService.create({ name: 'Ahmad' });

      expect(() =>
        harness.transactionService.create({
          customerId: customer.id,
          type: 'TRANSFER' as 'CASH_IN',
          amount: '10',
          currencyCode: 'AFN',
        }),
      ).toThrowError(/INVALID_TRANSACTION_TYPE/);

      expect(() =>
        harness.transactionService.create({
          customerId: customer.id,
          type: 'CASH_IN',
          amount: '',
          currencyCode: 'AFN',
        }),
      ).toThrowError(/AMOUNT_REQUIRED/);

      expect(() =>
        harness.transactionService.create({
          customerId: customer.id,
          type: 'CASH_IN',
          amount: 'NaN',
          currencyCode: 'AFN',
        }),
      ).toThrowError(/AMOUNT_INVALID/);

      expect(() =>
        harness.transactionService.create({
          customerId: customer.id,
          type: 'CASH_IN',
          amount: 'Infinity',
          currencyCode: 'AFN',
        }),
      ).toThrowError(/AMOUNT_INVALID/);

      expect(() =>
        harness.transactionService.create({
          customerId: customer.id,
          type: 'CASH_IN',
          amount: '-10',
          currencyCode: 'AFN',
        }),
      ).toThrowError(/AMOUNT_INVALID/);

      expect(() =>
        harness.transactionService.create({
          customerId: customer.id,
          type: 'CASH_IN',
          amount: '1.12345',
          currencyCode: 'AFN',
        }),
      ).toThrowError(/AMOUNT_INVALID/);

      expect(() =>
        harness.transactionService.create({
          customerId: customer.id,
          type: 'CASH_IN',
          amount: '10',
          currencyCode: 'BTC',
        }),
      ).toThrowError(/CURRENCY_INVALID/);

      expect(() =>
        harness.transactionService.create({
          customerId: 999,
          type: 'CASH_IN',
          amount: '10',
          currencyCode: 'AFN',
        }),
      ).toThrowError(/CUSTOMER_NOT_FOUND/);

      expect(harness.transactionService.list({ customerId: customer.id }).transactions).toHaveLength(0);
    } finally {
      harness.cleanup();
    }
  });

  it('stores Dari notes, marks edits as persisted, and recalculates after edit and delete', async () => {
    const harness = await createCustomerTestHarness();

    try {
      const customer = harness.customerService.create({ name: 'احمد' });
      const created = harness.transactionService.create({
        customerId: customer.id,
        type: 'CASH_IN',
        amount: '100',
        currencyCode: 'AFN',
        note: 'رسید شماره ۱۲۳',
      });
      expect(created.note).toBe('رسید شماره ۱۲۳');
      expect(created.isEdited).toBe(false);

      const updated = harness.transactionService.update({
        id: created.id,
        type: 'CASH_IN',
        amount: '250',
        currencyCode: 'AFN',
        note: 'رسید شماره ۱۲۳\nupdated',
      });
      expect(updated.isEdited).toBe(true);
      expect(updated.amount).toBe('250');
      expect(harness.transactionService.getCustomerSummary(customer.id).currencies[0]?.balance).toBe(
        '250.0000',
      );

      harness.transactionService.delete(created.id);
      expect(harness.transactionService.getCustomerSummary(customer.id).currencies[0]?.balance).toBe(
        '0.0000',
      );
      expect(() => harness.transactionService.getById(created.id)).toThrow(AppError);
    } finally {
      harness.cleanup();
    }
  });

  it('stamps a new transaction with the current local date and time', async () => {
    const harness = await createCustomerTestHarness();

    try {
      const customer = harness.customerService.create({ name: 'Ahmad' });
      const before = Date.now();
      const created = harness.transactionService.create({
        customerId: customer.id,
        type: 'CASH_IN',
        amount: '10',
        currencyCode: 'AFN',
      });
      const after = Date.now();

      expect(created.transactionDate).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      const stamp = new Date(created.transactionDate.replace(' ', 'T')).getTime();
      expect(stamp).toBeGreaterThanOrEqual(before - 1000);
      expect(stamp).toBeLessThanOrEqual(after + 1000);
    } finally {
      harness.cleanup();
    }
  });

  it('updates both date and time on an existing transaction', async () => {
    const harness = await createCustomerTestHarness();

    try {
      const customer = harness.customerService.create({ name: 'Ahmad' });
      const created = harness.transactionService.create({
        customerId: customer.id,
        type: 'CASH_IN',
        amount: '10',
        currencyCode: 'AFN',
      });

      const updated = harness.transactionService.update({
        id: created.id,
        type: 'CASH_IN',
        amount: '10',
        currencyCode: 'AFN',
        transactionDate: '2026-03-15T09:45',
      });

      expect(updated.transactionDate).toBe('2026-03-15 09:45:00');
      expect(updated.amount).toBe('10');
    } finally {
      harness.cleanup();
    }
  });
});
