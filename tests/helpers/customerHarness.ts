import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadAppConfig } from '../../src/main/config/appConfig';
import { DatabaseConnection } from '../../src/main/database/connection';
import { CustomerRepository } from '../../src/main/database/repositories/customerRepository';
import { seedDefaultAdminIfEmpty } from '../../src/main/services/auth/adminSeedService';
import { AuthService } from '../../src/main/services/auth/authService';
import { SessionStore } from '../../src/main/services/auth/sessionStore';
import { CurrencyService } from '../../src/main/services/currency/currencyService';
import { CustomerPhotoService } from '../../src/main/services/customer/customerPhotoService';
import { CustomerService } from '../../src/main/services/customer/customerService';
import { SettingsService } from '../../src/main/services/settings/settingsService';
import { TransactionService } from '../../src/main/services/transaction/transactionService';
import { ReportsService } from '../../src/main/services/report/reportsService';
import { ImportService } from '../../src/main/services/import/importService';
import { BackupService } from '../../src/main/services/backup/backupService';
import { CompanyLogoService } from '../../src/main/services/company/companyLogoService';
import { CompanyService } from '../../src/main/services/company/companyService';
import { TellerService } from '../../src/main/services/teller/tellerService';
import type { ApplicationContext } from '../../src/main/services/applicationContext';
import { applyProjectMigrations, createTestDatabase, type TestDatabase } from './testDatabase';

export interface CustomerTestHarness {
  testDb: TestDatabase;
  imagesDir: string;
  repository: CustomerRepository;
  customerService: CustomerService;
  transactionService: TransactionService;
  photoService: CustomerPhotoService;
  authService: AuthService;
  reportsService: ReportsService;
  importService: ImportService;
  backupService: BackupService;
  companyService: CompanyService;
  ctx: ApplicationContext;
  cleanup: () => void;
}

export async function createCustomerTestHarness(): Promise<CustomerTestHarness> {
  const testDb = createTestDatabase();
  applyProjectMigrations(testDb.db, testDb.logger);
  await seedDefaultAdminIfEmpty(testDb.db, testDb.logger);

  const imagesDir = join(testDb.dbPath, '..', 'images', 'customers');
  const companyImagesDir = join(testDb.dbPath, '..', 'images', 'company');
  mkdirSync(imagesDir, { recursive: true });
  mkdirSync(companyImagesDir, { recursive: true });
  mkdirSync(join(testDb.dbPath, '..', 'backups', 'auto'), { recursive: true });
  mkdirSync(join(testDb.dbPath, '..', 'cache'), { recursive: true });

  const photoService = new CustomerPhotoService(imagesDir, testDb.logger);
  const sessionStore = new SessionStore(8 * 60 * 60 * 1000);
  const migrationsDir = join(process.cwd(), 'migrations');
  const fontsDir = join(process.cwd(), 'assets', 'fonts');
  const reportsDir = join(testDb.dbPath, '..', 'cache', 'reports');
  mkdirSync(reportsDir, { recursive: true });

  const ctx = {
    config: loadAppConfig(),
    paths: {
      userData: join(testDb.dbPath, '..'),
      database: testDb.dbPath,
      images: imagesDir,
      companyImages: companyImagesDir,
      logs: join(testDb.dbPath, '..', 'logs'),
      backups: join(testDb.dbPath, '..', 'backups'),
      cache: join(testDb.dbPath, '..', 'cache'),
      config: join(testDb.dbPath, '..', 'config'),
    },
    logger: testDb.logger,
    database: null as unknown as DatabaseConnection,
  } as ApplicationContext;

  const harness: CustomerTestHarness = {
    testDb,
    imagesDir,
    repository: new CustomerRepository(testDb.db),
    customerService: new CustomerService(testDb.db, photoService, testDb.logger),
    transactionService: new TransactionService(testDb.db, testDb.logger),
    photoService,
    authService: new AuthService(testDb.db, sessionStore, testDb.logger),
    reportsService: new ReportsService({
      customerService: undefined as unknown as CustomerService,
      transactionService: undefined as unknown as TransactionService,
      reportsDir,
      logger: testDb.logger,
      fontsDir,
    }),
    importService: new ImportService(testDb.db, photoService, testDb.logger),
    backupService: undefined as unknown as BackupService,
    companyService: undefined as unknown as CompanyService,
    ctx,
    cleanup: testDb.cleanup,
  };

  function rebind(): void {
    harness.repository = new CustomerRepository(testDb.db);
    harness.customerService = new CustomerService(testDb.db, photoService, testDb.logger);
    harness.transactionService = new TransactionService(testDb.db, testDb.logger);
    harness.authService = new AuthService(testDb.db, sessionStore, testDb.logger);
    harness.companyService = new CompanyService(
      testDb.db,
      new CompanyLogoService(companyImagesDir, testDb.logger),
      testDb.logger,
    );
    harness.reportsService = new ReportsService({
      customerService: harness.customerService,
      transactionService: harness.transactionService,
      companyService: harness.companyService,
      reportsDir,
      logger: testDb.logger,
      fontsDir,
    });
    harness.importService = new ImportService(testDb.db, photoService, testDb.logger);
    ctx.authService = harness.authService;
    ctx.customerService = harness.customerService;
    ctx.transactionService = harness.transactionService;
    ctx.currencyService = new CurrencyService(testDb.db);
    ctx.settingsService = new SettingsService(testDb.db);
    ctx.reportsService = harness.reportsService;
    ctx.importService = harness.importService;
    ctx.backupService = harness.backupService;
    ctx.companyService = harness.companyService;
    ctx.tellerService = new TellerService(testDb.db, testDb.logger);
  }

  harness.backupService = new BackupService({
    getDatabase: () => testDb.db,
    checkpoint: () => {
      testDb.db.pragma('wal_checkpoint(FULL)');
    },
    closeDatabase: () => {
      try {
        testDb.db.pragma('wal_checkpoint(FULL)');
        testDb.db.close();
      } catch {
        // already closed
      }
    },
    reopenDatabase: () => {
      const db = new Database(testDb.dbPath);
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      db.pragma('busy_timeout = 5000');
      testDb.db = db;
      return db;
    },
    rebindServices: () => rebind(),
    invalidateSessions: () => sessionStore.clear(),
    paths: ctx.paths,
    appVersion: ctx.config.version,
    logger: testDb.logger,
    migrationsDir,
  });

  rebind();
  ctx.backupService = harness.backupService;

  return harness;
}
