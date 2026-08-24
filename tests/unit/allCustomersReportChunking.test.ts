import { describe, expect, it } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CustomerService } from '../../src/main/services/customer/customerService';
import { TransactionService } from '../../src/main/services/transaction/transactionService';
import { CustomerPhotoService } from '../../src/main/services/customer/customerPhotoService';
import { ReportsService } from '../../src/main/services/report/reportsService';
import { applyProjectMigrations, createTestDatabase } from '../helpers/testDatabase';

describe('all-customers report chunking', () => {
  it('includes every customer when UI page-size clamp would under-count', async () => {
    const testDb = createTestDatabase();
    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const imagesDir = join(testDb.dbPath, '..', 'images');
      mkdirSync(imagesDir, { recursive: true });
      const photoService = new CustomerPhotoService(imagesDir, testDb.logger);
      const customerService = new CustomerService(testDb.db, photoService, testDb.logger);
      const transactionService = new TransactionService(testDb.db, testDb.logger);

      const total = 250;
      for (let index = 0; index < total; index += 1) {
        customerService.create({ name: `Chunk ${index}`, customerNumber: `CH-${index}` });
      }

      // UI listPage clamps to MAX_PAGE_SIZE=100 — a naive loop with pageSize 500 would under-count.
      const naivePages = Math.ceil(total / 500);
      let naiveCount = 0;
      for (let page = 1; page <= naivePages; page += 1) {
        const result = customerService.listPage(page, 500, (identities) => ({
          customers: identities.map((identity) => ({
            ...identity,
            balances: {},
            cashInCount: 0,
            cashOutCount: 0,
          })),
          totals: [],
        }));
        naiveCount += result.customers.length;
      }
      expect(naiveCount).toBeLessThan(total);

      let reportCount = 0;
      const reportPages = Math.ceil(total / 500);
      for (let page = 1; page <= reportPages; page += 1) {
        const result = customerService.listPageForReport(page, 500, (identities) => ({
          customers: identities.map((identity) => ({
            ...identity,
            balances: {},
            cashInCount: 0,
            cashOutCount: 0,
          })),
          totals: [],
        }));
        reportCount += result.customers.length;
      }
      expect(reportCount).toBe(total);

      const reportsService = new ReportsService({
        customerService,
        transactionService,
        reportsDir: join(testDb.dbPath, '..', 'reports'),
        logger: testDb.logger,
      });
      const model = reportsService.buildModel({
        type: 'all_customers',
        format: 'xlsx',
        language: 'en',
      });
      expect(model.customerCount).toBe(total);
      expect(model.customers).toHaveLength(total);
    } finally {
      testDb.cleanup();
    }
  });
});
