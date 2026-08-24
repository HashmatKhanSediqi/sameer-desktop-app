import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { CustomerRepository } from '../../src/main/database/repositories/customerRepository';
import { CustomerPhotoService } from '../../src/main/services/customer/customerPhotoService';
import { CustomerService } from '../../src/main/services/customer/customerService';
import { TransactionService } from '../../src/main/services/transaction/transactionService';
import { ReportsService } from '../../src/main/services/report/reportsService';
import { BackupService } from '../../src/main/services/backup/backupService';
import { loadAppConfig } from '../../src/main/config/appConfig';
import type { CustomerIdentity, CustomerListItem } from '../../src/shared/types/customer';
import type { AppPaths } from '../../src/shared/types/ipc';
import { applyProjectMigrations, createTestDatabase } from '../helpers/testDatabase';
import {
  EXTREME_CUSTOMER_COUNT,
  EXTREME_TRANSACTION_COUNT,
  explainQueryPlan,
  memorySnapshot,
  seedScaleDataset,
} from '../helpers/scaleDataset';

const RUN_EXTREME =
  process.env.FMT_RUN_EXTREME_SCALE === '1' || process.env.npm_lifecycle_event === 'test:extreme';
const EXTREME_TIMEOUT_MS = 3 * 60 * 60 * 1000;

function enrichCustomers(
  transactionService: TransactionService,
  identities: CustomerIdentity[],
): { customers: CustomerListItem[]; totals: ReturnType<TransactionService['getGlobalTotals']> } {
  const accounting = transactionService.getListAccounting(identities.map((item) => item.id));
  return {
    customers: identities.map((identity) => {
      const stats = accounting.get(identity.id) ?? {
        balances: {},
        cashInCount: 0,
        cashOutCount: 0,
      };
      return { ...identity, ...stats };
    }),
    totals: transactionService.getGlobalTotals(),
  };
}

function persistMetrics(dir: string, metrics: Record<string, unknown>): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'extreme-scale-metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');
}

describe.skipIf(!RUN_EXTREME)('extreme scale validation (1M customers / 5M transactions)', () => {
  it(
    'seeds, queries, reports, backs up, and verifies integrity',
    async () => {
      const metrics: Record<string, unknown> = {
        startedAt: new Date().toISOString(),
        targetCustomers: EXTREME_CUSTOMER_COUNT,
        targetTransactions: EXTREME_TRANSACTION_COUNT,
      };
      const testDb = createTestDatabase();
      const root = join(testDb.dbPath, '..');
      const metricsDir = join(root, 'metrics');

      try {
        applyProjectMigrations(testDb.db, testDb.logger);

        const imagesDir = join(root, 'images');
        const companyImagesDir = join(root, 'company-images');
        const backupsDir = join(root, 'backups');
        const cacheDir = join(root, 'cache');
        const logsDir = join(root, 'logs');
        const configDir = join(root, 'config');
        for (const dir of [imagesDir, companyImagesDir, backupsDir, cacheDir, logsDir, configDir]) {
          mkdirSync(dir, { recursive: true });
        }

        const photoService = new CustomerPhotoService(imagesDir, testDb.logger);
        const customerRepository = new CustomerRepository(testDb.db);
        const customerService = new CustomerService(testDb.db, photoService, testDb.logger);
        const transactionService = new TransactionService(testDb.db, testDb.logger);

        // eslint-disable-next-line no-console
        console.info('[extreme-scale] seeding…');
        const seed = seedScaleDataset(testDb.db, {
          profile: {
            customerCount: EXTREME_CUSTOMER_COUNT,
            transactionCount: EXTREME_TRANSACTION_COUNT,
          },
          logProgress: true,
        });
        metrics.seedMs = Math.round(seed.seedMs);
        metrics.seedTransactions = seed.transactionCount;
        metrics.memoryAfterSeed = memorySnapshot();
        persistMetrics(metricsDir, metrics);

        expect(customerRepository.countCustomers()).toBe(EXTREME_CUSTOMER_COUNT);
        const txCount = (
          testDb.db.prepare('SELECT COUNT(*) AS count FROM transactions').get() as { count: number }
        ).count;
        expect(txCount).toBeGreaterThanOrEqual(EXTREME_TRANSACTION_COUNT - 10_000);
        expect(txCount).toBeLessThanOrEqual(EXTREME_TRANSACTION_COUNT + 10_000);
        metrics.actualTransactions = txCount;

        const orphans = (
          testDb.db
            .prepare(
              `SELECT COUNT(*) AS count
               FROM transactions t
               LEFT JOIN customers c ON c.id = t.customer_id
               WHERE c.id IS NULL`,
            )
            .get() as { count: number }
        ).count;
        expect(orphans).toBe(0);
        expect(testDb.db.pragma('quick_check', { simple: true })).toBe('ok');

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

        const searchCases: Record<string, { query: string; min?: number; max?: number }> = {
          exactNumber: { query: seed.exactSearchNumber, min: 1, max: 1 },
          commonName: { query: 'CommonName', min: 1 },
          rareName: { query: 'RareName Zeta', min: 1, max: 5 },
          partialName: { query: 'Customer 500', min: 1 },
          prefixName: { query: 'Customer 5000', min: 1 },
          middleName: { query: 'Name Smith', min: 1, max: 5 },
          noResult: { query: 'ZZZ-NO-MATCH-99999', max: 0 },
        };
        const searchTimings: Record<string, { totalMs: number; totalCount: number }> = {};
        for (const [label, searchCase] of Object.entries(searchCases)) {
          const started = performance.now();
          const page = customerService.searchPage(searchCase.query, 1, 25, (identities) =>
            enrichCustomers(transactionService, identities),
          );
          searchTimings[label] = {
            totalMs: Math.round(performance.now() - started),
            totalCount: page.totalCount,
          };
          if (searchCase.min !== undefined) {
            expect(page.totalCount).toBeGreaterThanOrEqual(searchCase.min);
          }
          if (searchCase.max !== undefined) {
            expect(page.totalCount).toBeLessThanOrEqual(searchCase.max);
          }
          expect(page.customers.length).toBeLessThanOrEqual(25);
        }
        metrics.searchTimingsMs = searchTimings;
        metrics.searchQueryPlans = {
          like: explainQueryPlan(
            testDb.db,
            `SELECT COUNT(*) AS count FROM customers
             WHERE name LIKE ? ESCAPE '!' COLLATE NOCASE
                OR customer_number LIKE ? ESCAPE '!' COLLATE NOCASE`,
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
          mediumTx: seed.mediumCustomerIds[0] ?? 11,
          heavyTx: seed.heavyCustomerIds[0] ?? 1,
          lightTx: 50_001,
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
        persistMetrics(metricsDir, metrics);

        const config = loadAppConfig();
        const paths: AppPaths = {
          userData: root,
          database: testDb.dbPath,
          images: imagesDir,
          companyImages: companyImagesDir,
          logs: logsDir,
          backups: backupsDir,
          cache: cacheDir,
          config: configDir,
        };

        const reportsService = new ReportsService({
          customerService,
          transactionService,
          reportsDir: join(cacheDir, 'reports'),
          logger: testDb.logger,
        });

        const reportTimings: Record<string, number> = {};
        const currencyStarted = performance.now();
        const currencyModel = reportsService.buildModel({
          type: 'currency_summary',
          format: 'xlsx',
          language: 'en',
        });
        reportTimings.currencySummaryModelMs = Math.round(performance.now() - currencyStarted);
        expect(currencyModel.currencySummaries.length).toBeGreaterThan(0);

        const currencyExcelStarted = performance.now();
        const currencyReport = await reportsService.generate({
          type: 'currency_summary',
          format: 'xlsx',
          language: 'en',
        });
        reportTimings.currencySummaryExcelMs = Math.round(performance.now() - currencyExcelStarted);
        expect(statSync(currencyReport.filePath).size).toBeGreaterThan(0);

        metrics.memoryBeforeReportChunks = memorySnapshot();
        const chunkStarted = performance.now();
        let sampled = 0;
        for (const page of [1, 1000, 2000]) {
          const pageResult = customerService.listPageForReport(page, 500, (identities) => ({
            customers: identities.map((identity) => ({
              ...identity,
              balances: {},
              cashInCount: 0,
              cashOutCount: 0,
            })),
            totals: [],
          }));
          sampled += pageResult.customers.length;
          expect(pageResult.totalCount).toBe(EXTREME_CUSTOMER_COUNT);
          expect(pageResult.customers.length).toBeLessThanOrEqual(500);
        }
        reportTimings.allCustomersSamplePagesMs = Math.round(performance.now() - chunkStarted);
        expect(sampled).toBeGreaterThan(0);
        metrics.memoryAfterReportChunks = memorySnapshot();
        metrics.reportTimingsMs = reportTimings;
        persistMetrics(metricsDir, metrics);

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

        const autoCloseStarted = performance.now();
        const autoClose = await backupService.createAutoCloseBackup();
        const autoCloseMs = Math.round(performance.now() - autoCloseStarted);
        expect(autoClose.created).toBe(true);

        const backupPath = join(backupsDir, 'FMT_ExtremeScale.cab');
        const backupCreateStarted = performance.now();
        await backupService.create(backupPath);
        const backupCreateMs = Math.round(performance.now() - backupCreateStarted);
        const validateStarted = performance.now();
        const validated = await backupService.validate(backupPath);
        const backupValidateMs = Math.round(performance.now() - validateStarted);
        const backupSizeBytes = statSync(backupPath).size;

        expect(validated.valid).toBe(true);
        expect(validated.manifest?.customerCount).toBe(EXTREME_CUSTOMER_COUNT);

        metrics.backup = {
          autoCloseMs,
          createMs: backupCreateMs,
          validateMs: backupValidateMs,
          sizeBytes: backupSizeBytes,
          sizeMb: Number((backupSizeBytes / (1024 * 1024)).toFixed(2)),
          autoClosePath: autoClose.filePath,
        };
        metrics.memoryPeak = memorySnapshot();
        metrics.finishedAt = new Date().toISOString();
        persistMetrics(metricsDir, metrics);

        // eslint-disable-next-line no-console
        console.info('[extreme-scale]', JSON.stringify(metrics, null, 2));

        expect(listTimings.firstPage ?? 0).toBeLessThan(15_000);
        expect(searchTimings.exactNumber?.totalMs ?? Number.POSITIVE_INFINITY).toBeLessThan(2_000);
        expect(backupCreateMs).toBeLessThan(30 * 60 * 1000);
      } finally {
        testDb.cleanup();
      }
    },
    EXTREME_TIMEOUT_MS,
  );
});
