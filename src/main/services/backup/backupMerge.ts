import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import type Database from 'better-sqlite3';
import { AppError } from '../../utils/errors';
import type { Logger } from '../../utils/logger';

interface BackupCustomerRow {
  id: number;
  name: string | null;
  customer_number: string | null;
  photo_filename: string | null;
  created_at: string;
  updated_at: string;
}

interface BackupTransactionRow {
  id: number;
  customer_id: number;
  type: string;
  currency_code: string;
  amount: string;
  note: string | null;
  transaction_date: string;
  created_at: string;
  updated_at: string;
  transfer_id: string | null;
  transfer_role: string | null;
  counterparty_customer_id: number | null;
}

export interface BackupMergeResult {
  customersImported: number;
  transactionsImported: number;
}

/**
 * Merge accounting records from a migrated backup database into the live database.
 * Does not overwrite admin, settings, company profile, or teller cash state.
 */
export function mergeBackupAccountingData(options: {
  liveDb: Database.Database;
  backupDb: Database.Database;
  backupImagesDir: string;
  liveImagesDir: string;
  logger: Logger;
}): BackupMergeResult {
  const { liveDb, backupDb, backupImagesDir, liveImagesDir, logger } = options;

  if (!tableExists(backupDb, 'customers')) {
    throw new AppError('INVALID_BACKUP', 'missingFiles');
  }

  const merge = liveDb.transaction(() => {
    mergeCurrencies(liveDb, backupDb);
    mergeDenominations(liveDb, backupDb);
    const customerMap = mergeCustomers(liveDb, backupDb);
    const transactionsImported = mergeTransactions(liveDb, backupDb, customerMap);
    return {
      customerMap,
      transactionsImported,
    };
  });

  const { customerMap, transactionsImported } = merge();
  applyImportedCustomerPhotos(liveDb, backupDb, customerMap, backupImagesDir, liveImagesDir);
  const result = {
    customersImported: customerMap.size,
    transactionsImported,
  };
  logger.info('Backup accounting data merged', result);
  return result;
}

function mergeCurrencies(liveDb: Database.Database, backupDb: Database.Database): void {
  if (!tableExists(backupDb, 'currencies')) {
    return;
  }

  const rows = backupDb
    .prepare(
      `SELECT code, name_key, symbol, is_active, sort_order,
              ${columnExists(backupDb, 'currencies', 'display_name') ? 'display_name' : 'code AS display_name'}
       FROM currencies`,
    )
    .all() as Array<{
    code: string;
    name_key: string;
    symbol: string | null;
    is_active: number;
    sort_order: number;
    display_name: string | null;
  }>;

  const insert = liveDb.prepare(
    `INSERT OR IGNORE INTO currencies (code, name_key, symbol, is_active, sort_order, display_name)
     VALUES (@code, @name_key, @symbol, @is_active, @sort_order, @display_name)`,
  );

  for (const row of rows) {
    insert.run({
      code: row.code,
      name_key: row.name_key,
      symbol: row.symbol,
      is_active: row.is_active,
      sort_order: row.sort_order,
      display_name: row.display_name || row.code,
    });
  }
}

function mergeDenominations(liveDb: Database.Database, backupDb: Database.Database): void {
  if (!tableExists(backupDb, 'denominations') || !tableExists(liveDb, 'denominations')) {
    return;
  }

  const rows = backupDb
    .prepare(
      `SELECT currency_code, value, sort_order, is_active
       FROM denominations`,
    )
    .all() as Array<{
    currency_code: string;
    value: string;
    sort_order: number;
    is_active: number;
  }>;

  const insert = liveDb.prepare(
    `INSERT OR IGNORE INTO denominations (currency_code, value, sort_order, is_active)
     VALUES (@currency_code, @value, @sort_order, @is_active)`,
  );

  for (const row of rows) {
    insert.run(row);
  }
}

function mergeCustomers(liveDb: Database.Database, backupDb: Database.Database): Map<number, number> {
  const rows = backupDb
    .prepare(
      `SELECT id, name, customer_number, photo_filename, created_at, updated_at
       FROM customers
       ORDER BY id ASC`,
    )
    .all() as BackupCustomerRow[];

  const insert = liveDb.prepare(
    `INSERT INTO customers (name, customer_number, photo_filename, created_at, updated_at)
     VALUES (@name, @customer_number, @photo_filename, @created_at, @updated_at)`,
  );
  const customerMap = new Map<number, number>();

  for (const row of rows) {
    const inserted = insert.run({
      name: row.name,
      customer_number: row.customer_number,
      photo_filename: null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
    customerMap.set(row.id, Number(inserted.lastInsertRowid));
  }

  return customerMap;
}

function applyImportedCustomerPhotos(
  liveDb: Database.Database,
  backupDb: Database.Database,
  customerMap: Map<number, number>,
  backupImagesDir: string,
  liveImagesDir: string,
): void {
  const rows = backupDb
    .prepare(
      `SELECT id, photo_filename
       FROM customers
       WHERE photo_filename IS NOT NULL AND trim(photo_filename) != ''`,
    )
    .all() as Array<{ id: number; photo_filename: string }>;

  if (rows.length === 0) {
    return;
  }

  mkdirSync(liveImagesDir, { recursive: true });
  const updatePhoto = liveDb.prepare('UPDATE customers SET photo_filename = ? WHERE id = ?');

  for (const row of rows) {
    const localId = customerMap.get(row.id);
    if (localId === undefined) {
      continue;
    }
    const photo = copyCustomerPhoto(row.photo_filename, row.id, localId, backupImagesDir, liveImagesDir);
    if (photo) {
      updatePhoto.run(photo, localId);
    }
  }
}

function mergeTransactions(
  liveDb: Database.Database,
  backupDb: Database.Database,
  customerMap: Map<number, number>,
): number {
  if (!tableExists(backupDb, 'transactions')) {
    return 0;
  }

  const hasTransferColumns = columnExists(backupDb, 'transactions', 'transfer_id');
  const rows = backupDb
    .prepare(
      hasTransferColumns
        ? `SELECT id, customer_id, type, currency_code, amount, note, transaction_date,
                  created_at, updated_at, transfer_id, transfer_role, counterparty_customer_id
           FROM transactions
           ORDER BY id ASC`
        : `SELECT id, customer_id, type, currency_code, amount, note, transaction_date,
                  created_at, updated_at, NULL AS transfer_id, NULL AS transfer_role,
                  NULL AS counterparty_customer_id
           FROM transactions
           ORDER BY id ASC`,
    )
    .all() as BackupTransactionRow[];

  const insert = liveDb.prepare(
    `INSERT INTO transactions (
       customer_id, type, currency_code, amount, note, transaction_date,
       created_at, updated_at, transfer_id, transfer_role, counterparty_customer_id
     ) VALUES (
       @customer_id, @type, @currency_code, @amount, @note, @transaction_date,
       @created_at, @updated_at, @transfer_id, @transfer_role, @counterparty_customer_id
     )`,
  );

  for (const row of rows) {
    const localCustomerId = customerMap.get(row.customer_id);
    if (localCustomerId === undefined) {
      throw new AppError('RESTORE_FAILED', 'restoreFailed');
    }
    const localCounterparty =
      row.counterparty_customer_id == null
        ? null
        : (customerMap.get(row.counterparty_customer_id) ?? null);

    insert.run({
      customer_id: localCustomerId,
      type: row.type,
      currency_code: row.currency_code,
      amount: row.amount,
      note: row.note,
      transaction_date: row.transaction_date,
      created_at: row.created_at,
      updated_at: row.updated_at,
      transfer_id: row.transfer_id,
      transfer_role: row.transfer_role,
      counterparty_customer_id: localCounterparty,
    });
  }

  return rows.length;
}

function copyCustomerPhoto(
  photoFilename: string | null,
  backupCustomerId: number,
  localCustomerId: number,
  backupImagesDir: string,
  liveImagesDir: string,
): string | null {
  if (!photoFilename) {
    return null;
  }

  const sourceName = photoFileName(photoFilename, backupCustomerId);
  const extension = extname(sourceName).replace('.', '').toLowerCase() || 'jpg';
  const source = join(backupImagesDir, sourceName);
  if (!existsSync(source)) {
    return null;
  }

  const destinationName = `${localCustomerId}.${extension}`;
  copyFileSync(source, join(liveImagesDir, destinationName));
  return `customers/${destinationName}`;
}

function photoFileName(photoFilename: string, backupCustomerId: number): string {
  const normalized = photoFilename.replaceAll('\\', '/');
  const slash = normalized.lastIndexOf('/');
  if (slash >= 0 && slash < normalized.length - 1) {
    return normalized.slice(slash + 1);
  }
  return `${backupCustomerId}${extname(normalized) || '.jpg'}`;
}

function tableExists(db: Database.Database, name: string): boolean {
  const row = db
    .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { present: number } | undefined;
  return row !== undefined;
}

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}
