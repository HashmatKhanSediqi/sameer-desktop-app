import { describe, expect, it } from 'vitest';
import { CustomerRepository } from '../../src/main/database/repositories/customerRepository';
import { applyProjectMigrations, createTestDatabase } from '../helpers/testDatabase';

describe('CustomerRepository', () => {
  it('creates and retrieves a customer', () => {
    const testDb = createTestDatabase();

    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const repository = new CustomerRepository(testDb.db);

      const id = repository.createCustomer({ name: 'Ahmad Khan', customerNumber: 'C-001' });
      const customer = repository.getCustomerById(id);

      expect(customer).toMatchObject({
        id,
        name: 'Ahmad Khan',
        customer_number: 'C-001',
        photo_filename: null,
      });
      expect(customer?.created_at).toBeTruthy();
      expect(customer?.updated_at).toBeTruthy();
    } finally {
      testDb.cleanup();
    }
  });

  it('lists customers newest first', () => {
    const testDb = createTestDatabase();

    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const repository = new CustomerRepository(testDb.db);

      const firstId = repository.createCustomer({ name: 'First', customerNumber: '1' });
      const secondId = repository.createCustomer({ name: 'Second', customerNumber: '2' });

      const listed = repository.listCustomers();
      expect(listed.map((row) => row.id)).toEqual([secondId, firstId]);
    } finally {
      testDb.cleanup();
    }
  });

  it('searches by customer name including Dari text', () => {
    const testDb = createTestDatabase();

    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const repository = new CustomerRepository(testDb.db);

      repository.createCustomer({ name: 'احمد خان', customerNumber: 'D-1' });
      repository.createCustomer({ name: 'Mahmood', customerNumber: 'M-1' });

      const results = repository.searchCustomers('%احمد%');
      expect(results).toHaveLength(1);
      expect(results[0]?.name).toBe('احمد خان');
    } finally {
      testDb.cleanup();
    }
  });

  it('searches by customer number with partial and case-insensitive ASCII match', () => {
    const testDb = createTestDatabase();

    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const repository = new CustomerRepository(testDb.db);

      repository.createCustomer({ name: 'Ahmad', customerNumber: 'AB-99' });
      repository.createCustomer({ name: 'Other', customerNumber: 'ZZ-1' });

      const results = repository.searchCustomers('%ab-99%');
      expect(results).toHaveLength(1);
      expect(results[0]?.customer_number).toBe('AB-99');
    } finally {
      testDb.cleanup();
    }
  });

  it('updates a customer without changing created_at', () => {
    const testDb = createTestDatabase();

    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const repository = new CustomerRepository(testDb.db);
      const id = repository.createCustomer({ name: 'Old', customerNumber: 'N-1' });
      const before = repository.getCustomerById(id);

      const updated = repository.updateCustomer(id, { name: 'New', customerNumber: 'N-2' });
      const after = repository.getCustomerById(id);

      expect(updated).toBe(true);
      expect(after?.name).toBe('New');
      expect(after?.customer_number).toBe('N-2');
      expect(after?.created_at).toBe(before?.created_at);
    } finally {
      testDb.cleanup();
    }
  });

  it('deletes a customer and treats missing ids as not found', () => {
    const testDb = createTestDatabase();

    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const repository = new CustomerRepository(testDb.db);
      const id = repository.createCustomer({ name: 'Temp', customerNumber: null });

      expect(repository.deleteCustomer(id)).toBe(true);
      expect(repository.getCustomerById(id)).toBeUndefined();
      expect(repository.deleteCustomer(id)).toBe(false);
      expect(repository.getCustomerById(999_999)).toBeUndefined();
    } finally {
      testDb.cleanup();
    }
  });

  it('stores SQL-like names safely via parameterized queries', () => {
    const testDb = createTestDatabase();

    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const repository = new CustomerRepository(testDb.db);
      const payload = "'; DROP TABLE customers; --";
      const id = repository.createCustomer({ name: payload, customerNumber: payload });
      const customer = repository.getCustomerById(id);

      expect(customer?.name).toBe(payload);
      const table = testDb.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'customers'")
        .get();
      expect(table).toBeTruthy();
    } finally {
      testDb.cleanup();
    }
  });
});
