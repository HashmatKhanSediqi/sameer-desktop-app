import type { AppConfig } from '../config/appConfig';
import { ensureUserDataDirectories, resolveAppPaths } from '../config/paths';
import { DatabaseConnection } from '../database/connection';
import type { AppPaths } from '@shared/types/ipc';
import type { Logger } from '../utils/logger';

export interface ApplicationContext {
  config: AppConfig;
  paths: AppPaths;
  logger: Logger;
  database: DatabaseConnection;
}

export function createApplicationContext(
  config: AppConfig,
  logger: Logger,
): ApplicationContext {
  const paths = resolveAppPaths();
  ensureUserDataDirectories(paths);

  const database = new DatabaseConnection(paths.database, logger);
  database.connect();

  return {
    config,
    paths,
    logger,
    database,
  };
}

export function shutdownApplicationContext(ctx: ApplicationContext): void {
  ctx.database.close();
  ctx.logger.info('Application context shut down');
}
