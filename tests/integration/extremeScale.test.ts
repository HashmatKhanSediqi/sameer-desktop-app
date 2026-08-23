import { performance } from 'node:perf_hooks';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CustomerRepository } from '../../src/main/database/repositories/customerRepository';
import { TransactionRepository } from '../../src/main/database/repositories/transactionRepository';
import { CustomerService } from '../../src/main/services/customer/customerService';
import { TransactionService } from '../../src/main/services/transaction/transactionService';
import { CustomerPhotoService } from '../../src/main/services/customer/customerPhotoService';
import { ReportsService } from '../../src/main/services/report/reportsService';
import { BackupService } from '../../src/main/services/backup/backupService';
import { loadAppConfig } from '../../src/main/config/appConfig';
import type { CustomerIdentity, CustomerListItem } from '../../src/shared/types/customer';
import { applyProjectMigrations, createTestDatabase } from '../helpers/testDatabase';
import {
  EXTREME_CUSTOMER_COUNT,
  EXTREME_TRANSACTION_COUNT,
  explainQueryPlan,
  memorySnapshot,
  seedScaleDataset,
} from '../helpers/scaleDataset';

const RUN_EXTREME = process.env.FMT_RUN_EXTREME_SCALE === '1' || process.env.npm_lifecycle_event === 'test:extreme';
const EXTREME_TIMEOUT_MS = 90 * 60 * 1000;

function enrichCustomers(
  transactionService: TransactionService,
  identities: CustomerIdentity[],
): { customers: CustomerListItem[]; totals: ReturnType<TransactionService['getGlobalTotals']> } {
  const accounting = transactionService.getListAccounting(identities.map((item) => item.id));
  return {
    customers: identities.map((identity) => {
      const stats = accounting.get(identity.id) ?? { balances: {}, cashInCount: 0, cashOutCount: 0 };
      return { ...identity, ...stats };
    }),
    totals: transactionService.getGlobalTotals(),
  };
}

describe.skipIf(!RUN_EXTREME)('extreme scale validation (1M customers / 5M transactions)', () => {
  it(
    'seeds, queries, reports, backs up, and verifies integrity',
    async () => {
      const metrics: Record<string, unknown> = {};
      const testDb = createTestDatabase();
      try {
        applyProjectMigrations(testDb.db, testDb.logger);
        const imagesDir = join(testDb.dbPath, '..', 'images');
        mkdirSync(imagesDir, { recursive: true });

        const customerRepository = new CustomerRepository(testDb.db);
        const transactionRepository = new TransactionRepository(testDb.db);
        const photoService = new CustomerPhotoService(imagesDir, testDb.logger);
        const customerService = new CustomerService(testDb.db, photoService, testDb.logger);
        const transactionService = new TransactionService(testDb.db, testDb.logger);

        const seed = seedScaleDataset(testDb.db, {
          profile: {
            customerCount: EXTREME_CUSTOMER_COUNT,
            transactionCount: EXTREME_TRANSACTION_COUNT,
          },
          logProgress: true,
        });
        metrics.seedMs = Math.round(seed.seedMs);
        metrics.memoryAfterSeed = memorySnapshot();

        expect(customerRepository.countCustomers()).toBe(EXTREME_CUSTOMER_COUNT);
        const txCountRow = testDb.db.prepare('SELECT COUNT(*) AS count FROM transactions').get() as {
          count: number;
        };
        expect(txCountRow.count).toBeGreaterThanOrEqual(EXTREME_TRANSACTION_COUNT - 10_000);
        expect(txCountRow.count).toBeLessThanOrEqual(EXTREME_TRANSACTION_COUNT + 10_000);

        const orphanRow = testDb.db
          .prepare(
            `SELECT COUNT(*) AS count
             FROM transactions t
             LEFT JOIN customers c ON c.id = t.customer_id
             WHERE c.id IS NULL`,
          )
          .get() as { count: number };
        expect(orphanRow.count).toBe(0);

        const integrity = testDb.db.pragma('integrity_check', { simple: true });
        expect(integrity).toBe('ok');

        const totalPages = Math.ceil(EXTREME_CUSTOMER_COUNT / 25);
        const listTimings: Record<string, number> = {};
        for (const [label, page] of [
          ['firstPage', 1],
          ['middlePage', Math.floor(totalPages / 2)],
          ['lastPage', totalPages],
        ] as const) {
          const started = performance.now();
          const result = customerService.listPage(page, 25, (identities) =>
            enrichCustomers(transactionService, identities),
          );
          listTimings[label] = Math.round(performance.now() - started);
          expect(result.customers.length).toBeLessThanOrEqual(25);
          expect(result.totalCount).toBe(EXTREME_CUSTOMER_COUNT);
        }
        metrics.listTimingsMs = listTimings;

        const globalStarted = performance.now();
        const totals = transactionService.getGlobalTotals();
        metrics.globalTotalsMs = Math.round(performance.now() - globalStarted);
        expect(totals.length).toBeGreaterThan(0);

        const searchCases: Record<string, { query: string; minResults?: number; maxResults?: number }> = {
          exactNumber: { query: seed.exactSearchNumber, minResults: 1, maxResults: 1 },
          commonName: { query: 'CommonName', minResults: 1 },
          rareName: { query: 'RareName Zeta', minResults: 1, maxResults: 5 },
          partialName: { query: 'Customer 500', minResults: 1 },
          prefixName: { query: 'Customer 5000', minResults: 1 },
          middleName: { query: 'Name Smith', minResults: 1, maxResults: 5 },
          noResult: { query: 'ZZZ-NO-MATCH-99999', maxResults: 0 },
        };
        const searchTimings: Record<string, { countMs: number; pageMs: number; totalMs: number; totalCount: number }> =
          {};
        for (const [label, searchCase] of Object.entries(searchCases)) {
          const started = performance.now();
          const countStarted = performance.now();
          const page = customerService.searchPage(searchCase.query, 1, 25, (identities) =>
            enrichCustomers(transactionService, identities),
          );
          const pageMs = Math.round(performance.now() - countStarted);
          const totalMs = Math.round(performance.now() - started);
          searchTimings[label] = {
            countMs: pageMs,
            pageMs,
            totalMs,
            totalCount: page.totalCount,
          };
          if (searchCase.minResults !== undefined) {
            expect(page.totalCount).toBeGreaterThanOrEqual(searchCase.minResults);
          }
          if (searchCase.maxResults !== undefined) {
            expect(page.totalCount).toBeLessThanOrEqual(searchCase.maxResults);
          }
          expect(page.customers.length).toBeLessThanOrEqual(25);
        }
        metrics.searchTimingsMs = searchTimings;

        metrics.searchQueryPlans = {
          like: explainQueryPlan(
            testDb.db,
            `SELECT COUNT(*) AS count FROM customers WHERE name LIKE ? ESCAPE '!' COLLATE NOCASE OR customer_number LIKE ? ESCAPE '!' COLLATE NOCASE`,
            '%Customer 500%',
            '%Customer 500%',
          ),
          exactNumber: explainQueryPlan(
            testDb.db,
            `SELECT COUNT(*) AS count FROM customers WHERE customer_number = ? COLLATE NOCASE`,
            'C-100',
          ),
        };

        const historyCases: Record<string, number> = {
          zeroTx: seed.zeroActivityCustomerIds[0] ?? 10,
          lightTx: seed.customerIds[50_000] ?? 50_000,
          mediumTx: seed.mediumCustomerIds[0] ?? 11,
          heavyTx: seed.heavyCustomerIds[0] ?? 1,
        };
        const historyTimings: Record<string, number> = {};
        for (const [label, customerId] of Object.entries(historyCases)) {
          const started = performance.now();
          const history = transactionService.list({ customerId, page: 1, pageSize: 25 });
          transactionService.getCustomerSummary(customerId);
          historyTimings[label] = Math.round(performance.now() - started);
          expect(history.transactions.length).toBeLessThanOrEqual(25);
          if (label === 'zeroTx') {
            expect(history.totalCount).toBe(0);
          }
          if (label === 'heavyTx') {
            expect(history.totalCount).toBeGreaterThan(10_000);
          }
        }
        metrics.historyTimingsMs = historyTimings;

        const config = loadAppConfig();
        const paths = {
          userData: join(testDb.dbPath, '..'),
          database: testDb.dbPath,
          images: imagesDir,
          companyImages: join(testDb.dbPath, '..', 'company-images'),
          logs: join(testDb.dbPath, '..', 'logs'),
          backups: join(testDb.dbPath, '..', 'backups'),
          cache: join(testDb.dbPath, '..', 'cache'),
          config: join(testDb.dbPath, '..', 'config'),
        };
        mkdirSync(paths.backups, { recursive: true });
        mkdirSync(paths.cache, { recursive: true });

        const reportsService = new ReportsService({
          customerService,
          transactionService,
          reportsDir: join(paths.cache, 'reports'),
          logger: testDb.logger,
        });

        const reportTimings: Record<string, number> = {};
        const currencySummaryStarted = performance.now();
        const currencyModel = reportsService.buildModel({
          type: 'currency_summary',
          format: 'xlsx',
          language: 'en',
        });
        reportTimings.currencySummaryModelMs = Math.round(performance.now() - currencySummaryStarted);
        expect(currencyModel.currencySummaries.length).toBeGreaterThan(0);

        const currencyExcelStarted = performance.now();
        const currencyReport = await reportsService.generate({
          type: 'currency_summary',
          format: 'xlsx',
          language: 'en',
        });
        reportTimings.currencySummaryExcelMs = Math.round(performance.now() - currencyExcelStarted);
        expect(statSync(currencyReport.filePath).size).toBeGreaterThan(0);

        metrics.memoryBeforeAllCustomersModel = memorySnapshot();
        const allCustomersModelStarted = performance.now();
        const allCustomersModel = reportsService.buildModel({
          type: 'all_customers',
          format: 'xlsx',
          language: 'en',
        });
        reportTimings.allCustomersModelMs = Math.round(performance.now() - allCustomersModelStarted);
        expect(allCustomersModel.customerCount).toBe(EXTREME_CUSTOMER_COUNT);
        metrics.memoryAfterAllCustomersModel = memorySnapshot();

        const backupService = new BackupService({
          getDatabase: () => testDb.db,
          checkpoint: () => {
            testDb.db.pragma('wal_checkpoint(FULL)');
          },
          closeDatabase: () => undefined,
          reopenDatabase: () => testDb.db,
          rebindServices: () => undefined,
          invalidateSessions: () => undefined,
          paths,
          appVersion: config.version,
          logger: testDb.logger,
          migrationsDir: join(process.cwd(), 'migrations'),
        });

        const backupPath = join(paths.backups, 'FMT_ExtremeScale.cab');
        const backupCreateStarted = performance.now();
        await backupService.create(backupPath);
        const backupCreateMs = Math.round(performance.now() - backupCreateStarted);
        const validateStarted = performance.now();
        const validated = await backupService.validate(backupPath);
        const backupValidateMs = Math.round(performance.now() - validateStarted);
        const backupSizeBytes = statSync(backupPath).size;

        expect(validated.valid).toBe(true);
        expect(validated.manifest?.customerCount).toBe(EXTREME_CUSTOMER_COUNT);

        metrics.reportTimingsMs = reportTimings;
        metrics.backup = {
          createMs: backupCreateMs,
          validateMs: backupValidateMs,
          sizeBytes: backupSizeBytes,
          sizeMb: Number((backupSizeBytes / (1024 * 1024)).toFixed(2)),
        };
        metrics.memoryPeak = memorySnapshot();
        metrics.customers = EXTREME_CUSTOMER_COUNT;
        metrics.transactions = txCountRow.count;

        // eslint-disable-next-line no-console
        console.info('[extreme-scale]', JSON.stringify(metrics, null, 2));

        expect(listTimings.firstPage ?? 0).toBeLessThan(15_000);
        expect(searchTimings.exactNumber?.totalMs ?? 0).toBeLessThan(500);
        expect(backupCreateMs).toBeLessThan(30 * 60 * 1000);
      } finally {
        testDb.cleanup();
      }
    },
    EXTREME_TIMEOUT_MS,
  );
});
