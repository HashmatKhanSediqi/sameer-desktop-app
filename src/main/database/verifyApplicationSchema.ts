import type Database from 'better-sqlite3';
import { AppError } from '../utils/errors';

/** Preparing explicit columns detects an incomplete schema even if its migration log says current. */
export function verifyApplicationSchema(db: Database.Database): void {
  const columns: Record<string, string> = {
    admin_users: 'id, username, password_hash, recovery_question, recovery_answer_hash',
    customers: 'id, name, customer_number, photo_filename',
    transactions: 'id, customer_id, currency_code, amount, transfer_id, transfer_role, counterparty_customer_id',
    currencies: 'code, display_name, is_active', settings: 'key, value',
    company_profile: 'id, name, configured, logo_filename',
    teller_currencies: 'code, display_name, is_active', denominations: 'id, currency_code, value, is_active',
    teller_sessions: 'id, currency_code, opening_amount, opp_amount, status',
    teller_transactions: 'id, session_id, worksheet_row, direction, declared_amount',
    teller_session_ht_denominations: 'session_id, denomination_id, quantity',
    teller_transaction_denominations: 'transaction_id, denomination_id, quantity',
  };
  for (const [table, fields] of Object.entries(columns)) db.prepare(`SELECT ${fields} FROM ${table} LIMIT 0`).all();
  if ((db.pragma('foreign_key_check') as unknown[]).length) throw new AppError('DATABASE_CORRUPTED', 'Foreign key integrity check failed');
}
