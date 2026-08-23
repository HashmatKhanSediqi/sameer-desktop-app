import { performance } from 'node:perf_hooks';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BackupService } from '../../src/main/services/backup/backupService';
import { applyProjectMigrations, createTestDatabase } from '../helpers/testDatabase';
import { loadAppConfig } from '../../src/main/config/appConfig';

const CUSTOMER_COUNT = 100_000;
const TRANSACTION_COUNT = 300_000;
const STRESS_TIMEOUT_MS = 10 * 60 * 1000;

function seedLargeDataset(db: import('better-sqlite3').Database): void {
  const insertCustomer = db.prepare('INSERT INTO customers (name, customer_number) VALUES (?, ?)');
  const insertTransaction = db.prepare(
    `INSERT INTO transactions (customer_id, type, currency_code, amount, note, transaction_date)
     VALUES (?, ?, ?, ?, NULL, ?)`,
  );

  const customerIds: number[] = [];
  db.transaction(() => {
    for (let index = 0; index < CUSTOMER_COUNT; index += 1) {
      customerIds.push(Number(insertCustomer.run(`Customer ${index}`, `C-${index}`).lastInsertRowid));
    }
  })();

  const currencies = ['AFN', 'USD', 'EUR'];
  const types = ['CASH_IN', 'CASH_OUT'] as const;
  db.transaction(() => {
    for (let index = 0; index < TRANSACTION_COUNT; index += 1) {
      insertTransaction.run(
        customerIds[index % customerIds.length]!,
        types[index % types.length],
        currencies[index % currencies.length],
        `${((index % 500) + 1).toFixed(4)}`,
        `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
      );
    }
  })();
}

describe('large-scale backup hardening', () => {
  it(
    'creates and validates a backup for 100k customers and 300k transactions',
    async () => {
      const testDb = createTestDatabase();
      try {
        applyProjectMigrations(testDb.db, testDb.logger);
        seedLargeDataset(testDb.db);

        const config = loadAppConfig();
        const paths = {
          userData: join(testDb.dbPath, '..'),
          database: testDb.dbPath,
          images: join(testDb.dbPath, '..', 'images'),
          companyImages: join(testDb.dbPath, '..', 'company-images'),
          logs: join(testDb.dbPath, '..', 'logs'),
          backups: join(testDb.dbPath, '..', 'backups'),
          cache: join(testDb.dbPath, '..', 'cache'),
          config: join(testDb.dbPath, '..', 'config'),
        };

        const backupService = new BackupService({
          getDatabase: () => testDb.db,
          checkpoint: () => {
            testDb.db.pragma('wal_checkpoint(FULL)');
          },
          closeDatabase: () => testDb.db.close(),
          reopenDatabase: () => testDb.db,
          rebindServices: () => undefined,
          invalidateSessions: () => undefined,
          paths,
          appVersion: config.version,
          logger: testDb.logger,
          migrationsDir: join(process.cwd(), 'migrations'),
        });

        const backupPath = join(paths.backups, 'FMT_ScaleBackup.cab');
        const started = performance.now();
        await backupService.create(backupPath);
        const createMs = performance.now() - started;
        const validated = await backupService.validate(backupPath);
        const sizeBytes = statSync(backupPath).size;

        expect(validated.valid).toBe(true);
        expect(validated.manifest?.customerCount).toBe(CUSTOMER_COUNT);
        expect(validated.manifest?.transactionCount).toBe(TRANSACTION_COUNT);

        // eslint-disable-next-line no-console
        console.info('[backup-scale]', {
          createMs: Math.round(createMs),
          sizeBytes,
          sizeMb: Number((sizeBytes / (1024 * 1024)).toFixed(2)),
        });

        expect(createMs).toBeLessThan(120_000);
      } finally {
        testDb.cleanup();
      }
    },
    STRESS_TIMEOUT_MS,
  );
});
