import type { AppConfig } from '../config/appConfig';
import { getMigrationsDirectory } from '../config/migrationsPath';
import { ensureUserDataDirectories, resolveAppPaths } from '../config/paths';
import { DatabaseConnection } from '../database/connection';
import { runMigrations } from '../database/migrationRunner';
import { seedDefaultAdminIfEmpty } from '../services/auth/adminSeedService';
import { AuthService } from '../services/auth/authService';
import { SessionStore } from '../services/auth/sessionStore';
import { CurrencyService } from '../services/currency/currencyService';
import { CustomerPhotoService } from '../services/customer/customerPhotoService';
import { CustomerService } from '../services/customer/customerService';
import { TransactionService } from '../services/transaction/transactionService';
import { SettingsService } from '../services/settings/settingsService';
import { ReportsService } from '../services/report/reportsService';
import { ImportService } from '../services/import/importService';
import { BackupService } from '../services/backup/backupService';
import { CompanyLogoService } from '../services/company/companyLogoService';
import { CompanyService } from '../services/company/companyService';
import { UpdateService } from '../services/update/updateService';
import { getFontsDirectory } from '../config/fontsPath';
import { clearCrashSentinel, hadUncleanShutdown, setCrashSentinel } from '../utils/crashSentinel';
import type { AppPaths } from '@shared/types/ipc';
import type { Logger } from '../utils/logger';
import { join } from 'node:path';

export interface ApplicationContext {
  config: AppConfig;
  paths: AppPaths;
  logger: Logger;
  database: DatabaseConnection;
  packaged: boolean;
  authService: AuthService;
  customerService: CustomerService;
  transactionService: TransactionService;
  currencyService: CurrencyService;
  settingsService: SettingsService;
  reportsService: ReportsService;
  importService: ImportService;
  backupService: BackupService;
  companyService: CompanyService;
  updateService: UpdateService;
}

export async function createApplicationContext(
  config: AppConfig,
  logger: Logger,
  options?: { packaged?: boolean },
): Promise<ApplicationContext> {
  const paths = resolveAppPaths();
  ensureUserDataDirectories(paths);

  if (hadUncleanShutdown(paths.userData)) {
    logger.warn('Possible unclean shutdown detected; verifying database integrity');
  }
  setCrashSentinel(paths.userData);

  const database = new DatabaseConnection(paths.database, logger);
  database.connect();

  const migrationsDir = getMigrationsDirectory();
  runMigrations(database.getConnection(), migrationsDir, logger);
  await seedDefaultAdminIfEmpty(database.getConnection(), logger);

  const ctx = {
    config,
    paths,
    logger,
    database,
    packaged: options?.packaged ?? false,
  } as ApplicationContext;

  bindApplicationServices(ctx, migrationsDir);
  return ctx;
}

export function bindApplicationServices(ctx: ApplicationContext, migrationsDir?: string): void {
  const db = ctx.database.getConnection();
  const resolvedMigrationsDir = migrationsDir ?? getMigrationsDirectory();
  const sessionStore = new SessionStore(ctx.config.sessionIdleTimeoutMs);
  const photoService = new CustomerPhotoService(ctx.paths.images, ctx.logger);
  const logoService = new CompanyLogoService(ctx.paths.companyImages, ctx.logger);
  ctx.authService = new AuthService(db, sessionStore, ctx.logger);
  ctx.customerService = new CustomerService(db, photoService, ctx.logger);
  ctx.transactionService = new TransactionService(db, ctx.logger);
  ctx.currencyService = new CurrencyService(db);
  ctx.settingsService = new SettingsService(db);
  ctx.companyService = new CompanyService(db, logoService, ctx.logger);
  ctx.reportsService = new ReportsService({
    customerService: ctx.customerService,
    transactionService: ctx.transactionService,
    companyService: ctx.companyService,
    reportsDir: join(ctx.paths.cache, 'reports'),
    logger: ctx.logger,
    fontsDir: getFontsDirectory(),
  });
  ctx.importService = new ImportService(db, photoService, ctx.logger);
  ctx.backupService = new BackupService({
    getDatabase: () => ctx.database.getConnection(),
    checkpoint: () => ctx.database.checkpoint(),
    closeDatabase: () => ctx.database.close(),
    reopenDatabase: () => ctx.database.connect(),
    rebindServices: () => bindApplicationServices(ctx, resolvedMigrationsDir),
    invalidateSessions: () => ctx.authService.invalidateAllSessions(),
    paths: ctx.paths,
    appVersion: ctx.config.version,
    logger: ctx.logger,
    migrationsDir: resolvedMigrationsDir,
  });
  if (ctx.updateService) {
    ctx.updateService.setBackupService(ctx.backupService);
  } else {
    ctx.updateService = new UpdateService({
      currentVersion: ctx.config.version,
      packaged: ctx.packaged,
      logger: ctx.logger,
      backupService: ctx.backupService,
    });
  }
}

export function shutdownApplicationContext(ctx: ApplicationContext): void {
  ctx.database.close();
  clearCrashSentinel(ctx.paths.userData);
  ctx.logger.info('Application context shut down');
}
