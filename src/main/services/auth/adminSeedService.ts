import bcrypt from 'bcrypt';
import type Database from 'better-sqlite3';
import { AdminRepository } from '../../database/repositories/adminRepository';
import type { Logger } from '../../utils/logger';

export const DEFAULT_ADMIN_USERNAME = 'admin';
export const DEFAULT_ADMIN_PASSWORD = 'admin123';
export const BCRYPT_COST = 10;

export async function seedDefaultAdminIfEmpty(
  db: Database.Database,
  logger: Logger,
): Promise<void> {
  const repository = new AdminRepository(db);

  if (repository.countAdmins() > 0) {
    return;
  }

  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, BCRYPT_COST);
  repository.createAdmin(DEFAULT_ADMIN_USERNAME, passwordHash);
  logger.info('Default admin account seeded', { username: DEFAULT_ADMIN_USERNAME });
}
