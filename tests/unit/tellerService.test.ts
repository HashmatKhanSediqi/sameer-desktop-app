import { describe, expect, it } from 'vitest';
import { applyProjectMigrations, createTestDatabase } from '../helpers/testDatabase';
import { seedDefaultAdminIfEmpty } from '../../src/main/services/auth/adminSeedService';
import { CustomerService } from '../../src/main/services/customer/customerService';
import { CustomerPhotoService } from '../../src/main/services/customer/customerPhotoService';
import { CurrencyService } from '../../src/main/services/currency/currencyService';
import { TellerService } from '../../src/main/services/teller/tellerService';
import { AppError } from '../../src/main/utils/errors';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

async function createTellerHarness() {
  const testDb = createTestDatabase();
  applyProjectMigrations(testDb.db, testDb.logger);
  await seedDefaultAdminIfEmpty(testDb.db, testDb.logger);
  const imagesDir = join(testDb.dbPath, '..', 'images', 'customers');
  mkdirSync(imagesDir, { recursive: true });
  const customerService = new CustomerService(
    testDb.db,
    new CustomerPhotoService(imagesDir, testDb.logger),
    testDb.logger,
  );
  const tellerService = new TellerService(testDb.db, testDb.logger);
  const currencyService = new CurrencyService(testDb.db);
  const admin = testDb.db.prepare('SELECT id FROM admin_users LIMIT 1').get() as { id: number };
  const customer = customerService.create({ name: 'Teller Customer', customerNumber: 'T-1' });
  return { testDb, tellerService, currencyService, userId: admin.id, customerId: customer.id };
}

function quantitiesFor(
  service: TellerService,
  currencyCode: string,
  pieces: Record<string, number>,
): Array<{ denominationId: number; quantity: number }> {
  return service
    .listDenominations(currencyCode)
    .filter((denom) => (pieces[denom.value] ?? 0) > 0)
    .map((denom) => ({ denominationId: denom.id, quantity: pieces[denom.value] ?? 0 }));
}

function afnQuantities(
  service: TellerService,
  pieces: Record<string, number>,
): Array<{ denominationId: number; quantity: number }> {
  return quantitiesFor(service, 'AFN', pieces);
}

function usdQuantities(
  service: TellerService,
  pieces: Record<string, number>,
): Array<{ denominationId: number; quantity: number }> {
  return quantitiesFor(service, 'USD', pieces);
}

describe('teller service', () => {
  it('records AFN cash in, updates tally, long book, and inventory', async () => {
    const harness = await createTellerHarness();
    try {
      const session = harness.tellerService.openSession(harness.userId, {
        openingQuantities: afnQuantities(harness.tellerService, { '1000': 1 }),
      });
      const created = harness.tellerService.createTransaction(harness.userId, {
        typeCode: 'CUSTOMER_CASH_IN',
        currencyCode: 'AFN',
        customerId: harness.customerId,
        amount: '3500',
        quantities: afnQuantities(harness.tellerService, { '1000': 3, '500': 1 }),
      });
      expect(created.amount).toBe('3500.0000');
      expect(created.validationStatus).toBe('OK');

      const tally = harness.tellerService.getTally(session.id, 'AFN');
      const thousand = tally.rows.find((row) => row.value === '1000' || row.value === '1000.0000' || row.value.startsWith('1000'));
      expect(thousand?.receivedPieces).toBe(4);
      expect(thousand?.paidPieces).toBe(0);
      expect(thousand?.remainingPieces).toBe(4);

      const book = harness.tellerService.getLongBook(session.id, 'AFN');
      expect(book.openingBalance).toBe('1000.0000');
      expect(book.totalReceived).toBe('3500.0000');
      expect(book.totalPaid).toBe('0.0000');
      expect(book.closingBalance).toBe('4500.0000');

      const dash = harness.tellerService.getDashboard();
      const afn = dash.currencies.find((row) => row.currencyCode === 'AFN');
      expect(afn?.cashIn).toBe('3500.0000');
      expect(afn?.physicalTally).toBe('4500.0000');
      expect(afn?.difference).toBe('0.0000');
    } finally {
      harness.testDb.cleanup();
    }
  });

  it('rejects cash in when declared amount does not match denominations', async () => {
    const harness = await createTellerHarness();
    try {
      harness.tellerService.openSession(harness.userId, {});
      expect(() =>
        harness.tellerService.createTransaction(harness.userId, {
          typeCode: 'CUSTOMER_CASH_IN',
          currencyCode: 'AFN',
          customerId: harness.customerId,
          amount: '4000',
          quantities: afnQuantities(harness.tellerService, { '1000': 3, '500': 1 }),
        }),
      ).toThrow(AppError);
    } finally {
      harness.testDb.cleanup();
    }
  });

  it('records cash out and rejects denomination shortage', async () => {
    const harness = await createTellerHarness();
    try {
      harness.tellerService.openSession(harness.userId, {
        openingQuantities: afnQuantities(harness.tellerService, { '1000': 2, '500': 1 }),
      });
      const out = harness.tellerService.createTransaction(harness.userId, {
        typeCode: 'CUSTOMER_CASH_OUT',
        currencyCode: 'AFN',
        customerId: harness.customerId,
        quantities: afnQuantities(harness.tellerService, { '1000': 1, '500': 1 }),
      });
      expect(out.amount).toBe('1500.0000');

      expect(() =>
        harness.tellerService.createTransaction(harness.userId, {
          typeCode: 'CUSTOMER_CASH_OUT',
          currencyCode: 'AFN',
          customerId: harness.customerId,
          quantities: afnQuantities(harness.tellerService, { '1000': 2 }),
        }),
      ).toThrow(AppError);

      const book = harness.tellerService.getLongBook(undefined, 'AFN');
      expect(book.closingBalance).toBe('1000.0000');
    } finally {
      harness.testDb.cleanup();
    }
  });

  it('supports USD cash in and cash out independently from AFN', async () => {
    const harness = await createTellerHarness();
    try {
      harness.tellerService.openSession(harness.userId, {
        openingQuantities: [
          ...afnQuantities(harness.tellerService, { '1000': 1 }),
          ...usdQuantities(harness.tellerService, { '100': 2 }),
        ],
      });
      harness.tellerService.createTransaction(harness.userId, {
        typeCode: 'HEAD_TELLER_IN',
        currencyCode: 'USD',
        quantities: usdQuantities(harness.tellerService, { '50': 1, '20': 2 }),
      });
      harness.tellerService.createTransaction(harness.userId, {
        typeCode: 'HEAD_TELLER_OUT',
        currencyCode: 'USD',
        quantities: usdQuantities(harness.tellerService, { '20': 1 }),
      });

      const usdBook = harness.tellerService.getLongBook(undefined, 'USD');
      expect(usdBook.openingBalance).toBe('200.0000');
      expect(usdBook.totalReceived).toBe('90.0000');
      expect(usdBook.totalPaid).toBe('20.0000');
      expect(usdBook.closingBalance).toBe('270.0000');

      const afnBook = harness.tellerService.getLongBook(undefined, 'AFN');
      expect(afnBook.closingBalance).toBe('1000.0000');
    } finally {
      harness.testDb.cleanup();
    }
  });

  it('keeps company 2 teller rows out of company 1 queries', async () => {
    const harness = await createTellerHarness();
    try {
      const session = harness.tellerService.openSession(harness.userId, {});
      const created = harness.tellerService.createTransaction(harness.userId, {
        typeCode: 'CUSTOMER_CASH_IN',
        currencyCode: 'AFN',
        customerId: harness.customerId,
        quantities: afnQuantities(harness.tellerService, { '100': 1 }),
      });

      harness.testDb.db
        .prepare(
          `INSERT INTO teller_sessions (id, company_id, teller_user_id, opened_at, status, created_by)
           VALUES (9001, 2, ?, datetime('now'), 'OPEN', ?)`,
        )
        .run(harness.userId, harness.userId);
      harness.testDb.db
        .prepare(
          `INSERT INTO teller_transactions (
             id, company_id, session_id, teller_user_id, transaction_number, type_code, currency_code,
             amount, denomination_total, running_balance, validation_status, transaction_date, created_by
           ) VALUES (9002, 2, 9001, ?, 'TL-999999', 'CUSTOMER_CASH_IN', 'AFN', '999.0000', '999.0000', '999.0000', 'OK', datetime('now'), ?)`,
        )
        .run(harness.userId, harness.userId);

      const listed = harness.tellerService.listTransactions({ page: 1, pageSize: 50 });
      expect(listed.transactions.some((row) => row.id === 9002)).toBe(false);
      expect(listed.transactions.some((row) => row.id === created.id)).toBe(true);
      expect(harness.tellerService.getCurrentSession()?.id).toBe(session.id);
      expect(() => harness.tellerService.getTransaction(9002)).toThrow(AppError);
    } finally {
      harness.testDb.cleanup();
    }
  });

  it('paginates a large teller history without returning the full set', async () => {
    const harness = await createTellerHarness();
    try {
      const session = harness.tellerService.openSession(harness.userId, {
        openingQuantities: afnQuantities(harness.tellerService, { '1': 1 }),
      });
      const denom = harness.tellerService.listDenominations('AFN').find((item) => item.value === '1');
      if (!denom) {
        throw new Error('AFN 1 denomination missing');
      }

      const insertTx = harness.testDb.db.prepare(
        `INSERT INTO teller_transactions (
           company_id, session_id, teller_user_id, transaction_number, type_code, currency_code,
           customer_id, amount, denomination_total, running_balance, validation_status, transaction_date, created_by
         ) VALUES (1, ?, ?, ?, 'CUSTOMER_CASH_IN', 'AFN', ?, '1.0000', '1.0000', '1.0000', 'OK', datetime('now'), ?)`,
      );
      const insertLine = harness.testDb.db.prepare(
        `INSERT INTO teller_transaction_denominations (
           company_id, transaction_id, denomination_id, quantity, unit_value, line_total
         ) VALUES (1, ?, ?, 1, '1.0000', '1.0000')`,
      );

      const seed = harness.testDb.db.transaction(() => {
        for (let index = 0; index < 2500; index += 1) {
          const result = insertTx.run(
            session.id,
            harness.userId,
            `TL-${String(index + 100).padStart(6, '0')}`,
            harness.customerId,
            harness.userId,
          );
          insertLine.run(Number(result.lastInsertRowid), denom.id);
        }
      });
      seed();

      const started = Date.now();
      const page = harness.tellerService.listTransactions({ page: 1, pageSize: 50, currencyCode: 'AFN' });
      const elapsed = Date.now() - started;
      expect(page.transactions).toHaveLength(50);
      expect(page.totalCount).toBeGreaterThanOrEqual(2500);
      expect(page.totalPages).toBeGreaterThan(1);
      expect(elapsed).toBeLessThan(2000);
    } finally {
      harness.testDb.cleanup();
    }
  });

  it('keeps custom-currency cash isolated and reports Excel-style tally, long book, and reconciliation', async () => {
    const harness = await createTellerHarness();
    try {
      harness.currencyService.create({ code: 'PKR', name: 'Pakistani Rupee', symbol: '₨' });
      harness.currencyService.createDenomination({ currencyCode: 'PKR', value: '1000' });
      harness.currencyService.createDenomination({ currencyCode: 'PKR', value: '500' });

      const session = harness.tellerService.openSession(harness.userId, {
        openingQuantities: [
          ...afnQuantities(harness.tellerService, { '1000': 2 }),
          ...quantitiesFor(harness.tellerService, 'EUR', { '50': 1, '0.50': 2 }),
          ...quantitiesFor(harness.tellerService, 'PKR', { '1000': 4 }),
        ],
      });

      harness.tellerService.createTransaction(harness.userId, {
        typeCode: 'HEAD_TELLER_IN',
        currencyCode: 'EUR',
        quantities: quantitiesFor(harness.tellerService, 'EUR', { '20': 1, '0.20': 5 }),
      });
      harness.tellerService.createTransaction(harness.userId, {
        typeCode: 'INTERNAL_TRANSFER_OUT',
        currencyCode: 'EUR',
        quantities: quantitiesFor(harness.tellerService, 'EUR', { '0.50': 1 }),
      });
      harness.tellerService.createTransaction(harness.userId, {
        typeCode: 'CUSTOMER_CASH_IN',
        currencyCode: 'PKR',
        customerId: harness.customerId,
        amount: '1500',
        quantities: quantitiesFor(harness.tellerService, 'PKR', { '1000': 1, '500': 1 }),
      });
      harness.tellerService.createTransaction(harness.userId, {
        typeCode: 'CUSTOMER_CASH_OUT',
        currencyCode: 'PKR',
        customerId: harness.customerId,
        quantities: quantitiesFor(harness.tellerService, 'PKR', { '1000': 1 }),
      });

      expect(() =>
        harness.tellerService.createTransaction(harness.userId, {
          typeCode: 'CUSTOMER_CASH_OUT',
          currencyCode: 'PKR',
          customerId: harness.customerId,
          quantities: quantitiesFor(harness.tellerService, 'PKR', { '1000': 5 }),
        }),
      ).toThrow(AppError);

      const eurTally = harness.tellerService.getTally(session.id, 'EUR');
      const fifty = eurTally.rows.find((row) => row.value === '50' || row.value.startsWith('50'));
      const half = eurTally.rows.find((row) => row.value.startsWith('0.5'));
      expect(fifty?.remainingPieces).toBe(1);
      expect(half?.receivedPieces).toBe(2);
      expect(half?.paidPieces).toBe(1);
      expect(half?.remainingPieces).toBe(1);
      expect(eurTally.totalCash).toBe('71.5000');

      const eurBook = harness.tellerService.getLongBook(session.id, 'EUR');
      expect(eurBook.openingBalance).toBe('51.0000');
      expect(eurBook.totalReceived).toBe('21.0000');
      expect(eurBook.totalPaid).toBe('0.5000');
      expect(eurBook.closingBalance).toBe('71.5000');

      const pkrBook = harness.tellerService.getLongBook(session.id, 'PKR');
      expect(pkrBook.openingBalance).toBe('4000.0000');
      expect(pkrBook.closingBalance).toBe('4500.0000');

      const afnBook = harness.tellerService.getLongBook(session.id, 'AFN');
      expect(afnBook.closingBalance).toBe('2000.0000');

      const dash = harness.tellerService.getDashboard();
      expect(dash.currencies.map((row) => row.currencyCode)).toEqual(expect.arrayContaining(['AFN', 'USD', 'EUR', 'PKR']));
      const eurDash = dash.currencies.find((row) => row.currencyCode === 'EUR');
      expect(eurDash?.displayName).toBe('Euro');
      expect(eurDash?.headTellerInCount).toBe(1);
      expect(eurDash?.cashInCount).toBe(1);
      expect(eurDash?.cashOutCount).toBe(1);
      expect(eurDash?.transactionCount).toBe(2);
      expect(eurDash?.physicalTally).toBe('71.5000');
      expect(eurDash?.difference).toBe('0.0000');
      expect(eurDash?.lastTransaction?.typeCode).toBe('INTERNAL_TRANSFER_OUT');

      const pkrDash = dash.currencies.find((row) => row.currencyCode === 'PKR');
      expect(pkrDash?.cashInCount).toBe(1);
      expect(pkrDash?.cashOutCount).toBe(1);

      const recon = harness.tellerService.getReconciliation(session.id);
      const eurRecon = recon.rows.find((row) => row.currencyCode === 'EUR');
      expect(eurRecon).toEqual({
        currencyCode: 'EUR',
        expectedCash: '71.5000',
        physicalTally: '71.5000',
        difference: '0.0000',
      });

      const pkrThousand = harness.tellerService.listDenominations('PKR').find((item) => item.value === '1000');
      expect(pkrThousand).toBeTruthy();
      harness.testDb.db
        .prepare(
          `UPDATE teller_cash_positions
           SET quantity = quantity + 1
           WHERE company_id = 1 AND denomination_id = ?`,
        )
        .run(pkrThousand!.id);
      const surplus = harness.tellerService.getReconciliation(session.id).rows.find((row) => row.currencyCode === 'PKR');
      expect(surplus?.expectedCash).toBe('4500.0000');
      expect(surplus?.physicalTally).toBe('5500.0000');
      expect(surplus?.difference).toBe('1000.0000');

      harness.testDb.db
        .prepare(
          `UPDATE teller_cash_positions
           SET quantity = quantity - 2
           WHERE company_id = 1 AND denomination_id = ?`,
        )
        .run(pkrThousand!.id);
      const shortage = harness.tellerService.getReconciliation(session.id).rows.find((row) => row.currencyCode === 'PKR');
      expect(shortage?.physicalTally).toBe('3500.0000');
      expect(shortage?.difference).toBe('-1000.0000');

      const usedEur = harness.currencyService
        .listDenominations('EUR', true)
        .find((item) => item.value === '50' || item.value.startsWith('50'));
      expect(usedEur?.inUse).toBe(true);
      expect(() => harness.currencyService.removeDenomination(usedEur!.id)).toThrowError(/DENOMINATION_IN_USE/);

      const unusedEur = harness.currencyService
        .listDenominations('EUR', true)
        .find((item) => item.value === '100' || item.value.startsWith('100'));
      expect(unusedEur?.inUse).toBe(false);
      harness.currencyService.removeDenomination(unusedEur!.id);
      expect(
        harness.currencyService.listDenominations('EUR', true).some((item) => item.value.startsWith('100')),
      ).toBe(false);
    } finally {
      harness.testDb.cleanup();
    }
  });
});
