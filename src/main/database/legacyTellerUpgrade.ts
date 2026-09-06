import Database from 'better-sqlite3';
import Decimal from 'decimal.js';
import { constants, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { AppError } from '../utils/errors';
import { verifyConnectedDatabaseIntegrity } from '../services/backup/sqliteIntegrity';

const LEGACY_TABLES = [
  'teller_sessions', 'teller_session_opening_denominations', 'teller_transactions',
  'teller_transaction_denominations', 'teller_cash_positions',
  'teller_session_currency_totals', 'teller_transaction_types', 'denominations',
] as const;

type LegacySession = {
  id: number; company_id: number; teller_user_id: number; opened_at: string;
  status: 'OPEN' | 'CLOSED'; note: string | null; created_at: string;
  closed_at: string | null; created_by: number; updated_at: string; updated_by: number | null;
};

export function createLegacyTellerSafetyCopy(
  db: Database.Database,
  safetyDirectory?: string,
): string {
  const databasePath = db.name;
  if (!databasePath || databasePath === ':memory:') {
    throw new AppError('DATABASE_ERROR', 'Legacy Teller upgrade requires a file-backed database safety copy');
  }
  db.pragma('wal_checkpoint(FULL)');
  const directory = safetyDirectory ?? join(dirname(databasePath), 'migration-safety');
  mkdirSync(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let target = join(directory, `${basename(databasePath)}.pre-migration-009-${stamp}.db`);
  for (let suffix = 1; existsSync(target); suffix += 1) {
    target = join(directory, `${basename(databasePath)}.pre-migration-009-${stamp}-${suffix}.db`);
  }
  copyFileSync(databasePath, target, constants.COPYFILE_EXCL);
  const copy = new Database(target, { readonly: true, fileMustExist: true });
  try {
    if (!verifyConnectedDatabaseIntegrity(copy)) throw new Error('integrity check failed');
  } catch (error) {
    throw new AppError('DATABASE_ERROR', `Pre-migration safety copy validation failed: ${String(error)}`);
  } finally { copy.close(); }
  return target;
}

export function hasLegacyTellerSnapshot(db: Database.Database): boolean {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='legacy_009_teller_sessions'").get());
}

/** Called inside migration 009's transaction before its destructive SQL. Persistent tables permit crash-safe resume at 009. */
export function snapshotLegacyTeller(db: Database.Database): void {
  for (const table of LEGACY_TABLES) db.exec(`CREATE TABLE legacy_009_${table} AS SELECT * FROM ${table}`);
}

/** Converts only active/unexported work. The validated safety DB retains all legacy history. */
export function importLegacyActiveTeller(db: Database.Database): void {
  const sessions = db.prepare('SELECT * FROM legacy_009_teller_sessions WHERE status = ? ORDER BY id').all('OPEN') as LegacySession[];
  const insertSession = db.prepare(`INSERT INTO teller_sessions
    (company_id,teller_user_id,currency_code,session_date,status,note,created_at,closed_at,created_by,updated_at,updated_by,opening_amount)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertOpening = db.prepare(`INSERT INTO teller_session_ht_denominations
    (session_id,company_id,denomination_id,quantity) VALUES (?,?,?,?)`);
  const insertTransaction = db.prepare(`INSERT INTO teller_transactions
    (company_id,session_id,direction,reference_label,declared_amount,created_at,created_by,updated_at,updated_by)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  const insertCount = db.prepare(`INSERT INTO teller_transaction_denominations
    (transaction_id,company_id,denomination_id,quantity) VALUES (?,?,?,?)`);

  for (const session of sessions) {
    const currencyRows = db.prepare(`SELECT currency_code FROM legacy_009_teller_transactions WHERE session_id=?
      UNION SELECT d.currency_code FROM legacy_009_teller_session_opening_denominations o
        JOIN legacy_009_denominations d ON d.id=o.denomination_id WHERE o.session_id=?
      UNION SELECT currency_code FROM legacy_009_teller_session_currency_totals WHERE session_id=?`).all(
      session.id, session.id, session.id,
    ) as Array<{ currency_code: string }>;
    for (const { currency_code: currency } of currencyRows) {
      const openings = db.prepare(`SELECT o.denomination_id,o.quantity,o.line_total
        FROM legacy_009_teller_session_opening_denominations o
        JOIN legacy_009_denominations d ON d.id=o.denomination_id
        WHERE o.session_id=? AND d.currency_code=?`).all(session.id, currency) as Array<{
          denomination_id: number; quantity: number; line_total: string;
        }>;
      const openingAmount = openings.reduce((sum, row) => sum.plus(row.line_total), new Decimal(0)).toFixed(4);
      const result = insertSession.run(
        session.company_id, session.teller_user_id, currency, session.opened_at.slice(0, 10),
        'OPEN', session.note, session.created_at, null, session.created_by, session.updated_at, session.updated_by,
        openingAmount,
      );
      const newSessionId = Number(result.lastInsertRowid);
      for (const row of openings) insertOpening.run(newSessionId, session.company_id, row.denomination_id, row.quantity);

      const transactions = db.prepare(`SELECT t.*,tt.direction AS legacy_direction
        FROM legacy_009_teller_transactions t JOIN legacy_009_teller_transaction_types tt ON tt.code=t.type_code
        WHERE t.session_id=? AND t.currency_code=? AND tt.direction IN ('IN','OUT') ORDER BY t.transaction_date,t.id`).all(
        session.id, currency,
      ) as Array<Record<string, unknown> & { id: number; company_id: number; transaction_number: string;
        amount: string; note: string | null; legacy_direction: 'IN' | 'OUT'; transaction_date: string;
        created_at: string; created_by: number; updated_at: string; updated_by: number | null }>;
      for (const transaction of transactions) {
        const label = transaction.note?.trim() || transaction.transaction_number;
        const inserted = insertTransaction.run(transaction.company_id, newSessionId,
          transaction.legacy_direction === 'IN' ? 'DEPOSIT' : 'WITHDRAWAL', label,
          transaction.amount, transaction.created_at || transaction.transaction_date,
          transaction.created_by, transaction.updated_at, transaction.updated_by);
        const counts = db.prepare(`SELECT denomination_id,quantity FROM legacy_009_teller_transaction_denominations
          WHERE transaction_id=?`).all(transaction.id) as Array<{ denomination_id: number; quantity: number }>;
        for (const count of counts) insertCount.run(Number(inserted.lastInsertRowid), transaction.company_id, count.denomination_id, count.quantity);
      }
    }
  }
  for (const table of LEGACY_TABLES) db.exec(`DROP TABLE legacy_009_${table}`);
}
