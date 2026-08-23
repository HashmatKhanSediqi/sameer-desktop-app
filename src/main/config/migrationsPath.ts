import { app } from 'electron';
import { join } from 'node:path';
import { resolveMigrationsDirectory } from '../database/migrationRunner';

export function getMigrationsDirectory(): string {
  return resolveMigrationsDirectory([
    join(process.cwd(), 'migrations'),
    join(app.getAppPath(), 'migrations'),
    join(process.resourcesPath, 'migrations'),
    join(__dirname, '../../../migrations'),
  ]);
}
