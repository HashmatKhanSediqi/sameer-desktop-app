import { describe, expect, it } from 'vitest';
import { CurrencyService } from '../../src/main/services/currency/currencyService';
import { applyProjectMigrations, createTestDatabase } from '../helpers/testDatabase';

describe('CurrencyService settings operations', () => {
  it('creates a new active currency and lists it', () => {
    const testDb = createTestDatabase();
    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const service = new CurrencyService(testDb.db);

      const created = service.create({ code: 'gbp', symbol: '£' });
      expect(created.code).toBe('GBP');
      expect(created.symbol).toBe('£');
      expect(created.isActive).toBe(true);
      expect(created.nameKey).toBe('currency.gbp');
      expect(created.displayName).toBe('GBP');
      expect(service.listActive().some((currency) => currency.code === 'GBP')).toBe(true);
    } finally {
      testDb.cleanup();
    }
  });

  it('rejects duplicate active codes and invalid codes', () => {
    const testDb = createTestDatabase();
    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const service = new CurrencyService(testDb.db);

      expect(() => service.create({ code: 'AFN' })).toThrowError(/CURRENCY_EXISTS/);
      expect(() => service.create({ code: 'A' })).toThrowError(/CURRENCY_CODE_INVALID/);
    } finally {
      testDb.cleanup();
    }
  });

  it('deactivates a currency and prevents removing the last active one', () => {
    const testDb = createTestDatabase();
    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const service = new CurrencyService(testDb.db);

      const deactivated = service.deactivate('EUR');
      expect(deactivated.isActive).toBe(false);
      expect(service.listActive().map((currency) => currency.code)).toEqual(['AFN', 'USD']);
      expect(service.listAll().some((currency) => currency.code === 'EUR' && !currency.isActive)).toBe(true);

      service.deactivate('USD');
      expect(() => service.deactivate('AFN')).toThrowError(/LAST_ACTIVE_CURRENCY/);
      expect(service.listActive()).toHaveLength(1);
    } finally {
      testDb.cleanup();
    }
  });

  it('reactivates an inactive currency when created again', () => {
    const testDb = createTestDatabase();
    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const service = new CurrencyService(testDb.db);
      service.deactivate('EUR');

      const restored = service.create({ code: 'EUR', symbol: '€' });
      expect(restored.isActive).toBe(true);
      expect(restored.symbol).toBe('€');
    } finally {
      testDb.cleanup();
    }
  });

  it('reactivates through the explicit reactivate method without duplicating codes', () => {
    const testDb = createTestDatabase();
    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const service = new CurrencyService(testDb.db);
      service.deactivate('EUR');

      const restored = service.reactivate('EUR');
      expect(restored.isActive).toBe(true);
      expect(service.listAll().filter((currency) => currency.code === 'EUR')).toHaveLength(1);

      const stillActive = service.reactivate('EUR');
      expect(stillActive.isActive).toBe(true);

      service.deactivate('EUR');
      const restoredAgain = service.create({ code: 'eur', symbol: '€' });
      expect(restoredAgain.isActive).toBe(true);
      expect(service.listAll().filter((currency) => currency.code === 'EUR')).toHaveLength(1);
    } finally {
      testDb.cleanup();
    }
  });

  it('permanently deletes an unused currency and blocks deletion when history exists', () => {
    const testDb = createTestDatabase();
    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const service = new CurrencyService(testDb.db);

      const created = service.create({ code: 'GBP', symbol: '£' });
      expect(created.hasTransactions).toBe(false);
      const removed = service.remove('GBP');
      expect(removed).toEqual({ code: 'GBP', deleted: true });
      expect(service.listAll().some((currency) => currency.code === 'GBP')).toBe(false);

      service.deactivate('EUR');
      expect(() => service.remove('EUR')).not.toThrow();

      const customerId = Number(
        testDb.db.prepare('INSERT INTO customers (name) VALUES (?)').run('Ahmad').lastInsertRowid,
      );
      testDb.db
        .prepare(
          `INSERT INTO transactions (customer_id, type, currency_code, amount)
           VALUES (?, 'CASH_IN', 'USD', '10.00')`,
        )
        .run(customerId);

      const usdBefore = testDb.db.prepare('SELECT COUNT(*) AS count FROM transactions WHERE currency_code = ?').get('USD') as {
        count: number;
      };
      expect(() => service.remove('USD')).toThrowError(/CURRENCY_IN_USE/);
      const usdAfter = testDb.db.prepare('SELECT COUNT(*) AS count FROM transactions WHERE currency_code = ?').get('USD') as {
        count: number;
      };
      expect(usdAfter.count).toBe(usdBefore.count);
      expect(service.listAll().some((currency) => currency.code === 'USD')).toBe(true);
    } finally {
      testDb.cleanup();
    }
  });

  it('does not delete the last active currency', () => {
    const testDb = createTestDatabase();
    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const service = new CurrencyService(testDb.db);
      service.deactivate('EUR');
      service.deactivate('USD');
      expect(() => service.remove('AFN')).toThrowError(/LAST_ACTIVE_CURRENCY/);
      expect(service.listActive()).toHaveLength(1);
    } finally {
      testDb.cleanup();
    }
  });

  it('stores display names and seeds EUR denominations', () => {
    const testDb = createTestDatabase();
    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const service = new CurrencyService(testDb.db);
      const afn = service.listAll().find((currency) => currency.code === 'AFN');
      expect(afn?.displayName).toBe('Afghan Afghani');
      const eur = service.listDenominations('EUR');
      expect(eur.map((item) => item.value)).toEqual([
        '100',
        '50',
        '20',
        '10',
        '5',
        '2',
        '1',
        '0.50',
        '0.20',
        '0.10',
        '0.05',
        '0.02',
        '0.01',
      ]);
      for (const code of ['AFN', 'USD', 'EUR']) {
        const original = service.listDenominations(code)[0]!;
        const added = service.createDenomination({ currencyCode: code, value: `0.${original.id}` });
        expect(added.currencyCode).toBe(code);
        service.deactivateDenomination(original.id);
        expect(service.listDenominations(code).some((item) => item.id === original.id)).toBe(false);
        expect(service.listDenominations(code, true).find((item) => item.id === original.id)?.isActive).toBe(false);
      }
    } finally {
      testDb.cleanup();
    }
  });

  it('creates custom currencies with arbitrary denominations and blocks deleting used values', () => {
    const testDb = createTestDatabase();
    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const service = new CurrencyService(testDb.db);

      const pkr = service.create({ code: 'PKR', name: 'Pakistani Rupee', symbol: '₨' });
      expect(pkr.displayName).toBe('Pakistani Rupee');
      const created = service.createDenomination({ currencyCode: 'PKR', value: '5000' });
      expect(created.value).toBe('5000');
      service.createDenomination({ currencyCode: 'PKR', value: '1000' });
      service.createDenomination({ currencyCode: 'PKR', value: '0.50' });
      expect(service.listDenominations('PKR')).toHaveLength(3);
      expect(() => service.createDenomination({ currencyCode: 'PKR', value: '5000' })).toThrowError(
        /DENOMINATION_EXISTS/,
      );

      const extra = service.createDenomination({ currencyCode: 'PKR', value: '20' });
      service.removeDenomination(extra.id);
      expect(service.listDenominations('PKR').some((item) => item.value === '20')).toBe(false);

      const inr = service.create({ code: 'INR', name: 'Indian Rupee', symbol: '₹' });
      expect(inr.code).toBe('INR');
      for (const value of ['500', '200', '100', '50', '20', '10', '5', '2', '1']) {
        service.createDenomination({ currencyCode: 'INR', value });
      }
      expect(service.listDenominations('INR')).toHaveLength(9);
    } finally {
      testDb.cleanup();
    }
  });
});
