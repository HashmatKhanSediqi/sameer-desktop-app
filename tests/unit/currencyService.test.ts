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
});
