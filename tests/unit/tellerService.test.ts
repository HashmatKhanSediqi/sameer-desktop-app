import { describe, expect, it } from 'vitest';
import { applyProjectMigrations, createTestDatabase } from '../helpers/testDatabase';
import { seedDefaultAdminIfEmpty } from '../../src/main/services/auth/adminSeedService';
import { CustomerService } from '../../src/main/services/customer/customerService';
import { CustomerPhotoService } from '../../src/main/services/customer/customerPhotoService';
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
  const admin = testDb.db.prepare('SELECT id FROM admin_users LIMIT 1').get() as { id: number };
  const customer = customerService.create({ name: 'Teller Customer', customerNumber: 'T-1' });
  return { testDb, tellerService, userId: admin.id, customerId: customer.id };
}

function afnQuantities(
  service: TellerService,
  pieces: Record<string, number>,
): Array<{ denominationId: number; quantity: number }> {
  return service
    .listDenominations('AFN')
    .filter((denom) => (pieces[denom.value] ?? 0) > 0)
    .map((denom) => ({ denominationId: denom.id, quantity: pieces[denom.value] ?? 0 }));
}

function usdQuantities(
  service: TellerService,
  pieces: Record<string, number>,
): Array<{ denominationId: number; quantity: number }> {
  return service
    .listDenominations('USD')
    .filter((denom) => (pieces[denom.value] ?? 0) > 0)
    .map((denom) => ({ denominationId: denom.id, quantity: pieces[denom.value] ?? 0 }));
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
});
