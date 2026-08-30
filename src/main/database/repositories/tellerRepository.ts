import type Database from 'better-sqlite3';
import type { TellerDenomination, TellerDirection, TellerSession, TellerSessionStatus } from '@shared/types/teller';

const SESSION_SELECT = `SELECT s.id, s.company_id, s.teller_user_id, u.username AS teller_username,
                s.currency_code, s.session_date, s.branch_name, s.branch_code,
                s.opening_amount, s.opp_amount, s.cash_in_icba, s.cash_out_icba, s.status, s.note,
                s.created_at, s.closed_at, s.created_by, s.updated_at, s.updated_by
         FROM teller_sessions s
         LEFT JOIN admin_users u ON u.id = s.teller_user_id`;

export interface TellerSessionRecord {
  id: number;
  company_id: number;
  teller_user_id: number;
  teller_username?: string | null;
  currency_code: string;
  session_date: string;
  branch_name: string | null;
  branch_code: string | null;
  opening_amount: string;
  opp_amount: string;
  cash_in_icba: string;
  cash_out_icba: string;
  status: TellerSessionStatus;
  note: string | null;
  created_at: string;
  closed_at: string | null;
  created_by: number;
  updated_at: string;
  updated_by: number | null;
}

export interface TellerTransactionRecord {
  id: number;
  company_id: number;
  session_id: number;
  direction: TellerDirection;
  reference_label: string;
  declared_amount: string | null;
  created_at: string;
  created_by: number;
  updated_at: string;
  updated_by: number | null;
  currency_code?: string;
}

export interface TellerDenomLineRecord {
  denomination_id: number;
  value: string;
  quantity: number;
}

export interface TellerListFilters {
  companyId: number;
  sessionId?: number;
  currencyCode?: string;
  direction?: TellerDirection;
  referenceLabel?: string;
  dateFrom?: string;
  dateTo?: string;
}

export class TellerRepository {
  constructor(private readonly db: Database.Database) {}

  resolveCompanyId(): number {
    const row = this.db.prepare('SELECT id FROM company_profile WHERE id = 1').get() as
      | { id: number }
      | undefined;
    return row?.id ?? 1;
  }

  listDenominations(currencyCode?: string): TellerDenomination[] {
    const rows = currencyCode
      ? (this.db
          .prepare(
            `SELECT id, currency_code, value, sort_order, is_active
             FROM denominations
             WHERE is_active = 1 AND currency_code = ?
             ORDER BY sort_order ASC, id ASC`,
          )
          .all(currencyCode) as Array<{
          id: number;
          currency_code: string;
          value: string;
          sort_order: number;
          is_active: number;
        }>)
      : (this.db
          .prepare(
            `SELECT id, currency_code, value, sort_order, is_active
             FROM denominations
             WHERE is_active = 1
             ORDER BY currency_code ASC, sort_order ASC, id ASC`,
          )
          .all() as Array<{
          id: number;
          currency_code: string;
          value: string;
          sort_order: number;
          is_active: number;
        }>);

    return rows.map((row) => ({
      id: row.id,
      currencyCode: row.currency_code,
      value: row.value,
      sortOrder: row.sort_order,
      isActive: row.is_active === 1,
    }));
  }

  getOpenSession(companyId: number, currencyCode: string): TellerSession | undefined {
    const row = this.db
      .prepare(
        `${SESSION_SELECT}
         WHERE s.company_id = ? AND s.currency_code = ? AND s.status = 'OPEN'
         LIMIT 1`,
      )
      .get(companyId, currencyCode) as TellerSessionRecord | undefined;
    return row ? toSession(row, this.listOpeningCounts(row.id)) : undefined;
  }

  getSessionByDate(companyId: number, currencyCode: string, sessionDate: string): TellerSession | undefined {
    const row = this.db
      .prepare(
        `${SESSION_SELECT}
         WHERE s.company_id = ? AND s.currency_code = ? AND s.session_date = ?
         LIMIT 1`,
      )
      .get(companyId, currencyCode, sessionDate) as TellerSessionRecord | undefined;
    return row ? toSession(row, this.listOpeningCounts(row.id)) : undefined;
  }

  getLatestSessionBefore(companyId: number, currencyCode: string, sessionDate: string): TellerSession | undefined {
    const row = this.db
      .prepare(
        `${SESSION_SELECT}
         WHERE s.company_id = ? AND s.currency_code = ? AND s.session_date < ?
         ORDER BY s.session_date DESC, s.id DESC
         LIMIT 1`,
      )
      .get(companyId, currencyCode, sessionDate) as TellerSessionRecord | undefined;
    return row ? toSession(row, this.listOpeningCounts(row.id)) : undefined;
  }

  listOpenSessions(companyId: number): TellerSession[] {
    const rows = this.db
      .prepare(
        `${SESSION_SELECT}
         WHERE s.company_id = ? AND s.status = 'OPEN'
         ORDER BY s.currency_code ASC`,
      )
      .all(companyId) as TellerSessionRecord[];
    return rows.map((row) => toSession(row, this.listOpeningCounts(row.id)));
  }

  getSession(companyId: number, sessionId: number): TellerSession | undefined {
    const row = this.db
      .prepare(
        `${SESSION_SELECT}
         WHERE s.company_id = ? AND s.id = ?
         LIMIT 1`,
      )
      .get(companyId, sessionId) as TellerSessionRecord | undefined;
    return row ? toSession(row, this.listOpeningCounts(row.id)) : undefined;
  }

  insertSession(input: {
    companyId: number;
    tellerUserId: number;
    currencyCode: string;
    sessionDate: string;
    branchName: string | null;
    branchCode: string | null;
    openingAmount: string;
    oppAmount: string;
    cashInICBA: string;
    cashOutICBA: string;
    note: string | null;
    createdBy: number;
  }): number {
    const result = this.db
      .prepare(
        `INSERT INTO teller_sessions (
           company_id, teller_user_id, currency_code, session_date, branch_name, branch_code,
           opening_amount, opp_amount, cash_in_icba, cash_out_icba, status, note, created_by, updated_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)`,
      )
      .run(
        input.companyId,
        input.tellerUserId,
        input.currencyCode,
        input.sessionDate,
        input.branchName,
        input.branchCode,
        input.openingAmount,
        input.oppAmount,
        input.cashInICBA,
        input.cashOutICBA,
        input.note,
        input.createdBy,
        input.createdBy,
      );
    return Number(result.lastInsertRowid);
  }

  updateSession(input: {
    companyId: number;
    sessionId: number;
    branchName: string | null;
    branchCode: string | null;
    openingAmount: string;
    oppAmount: string;
    cashInICBA: string;
    cashOutICBA: string;
    note: string | null;
    updatedBy: number;
  }): boolean {
    const result = this.db
      .prepare(
        `UPDATE teller_sessions
         SET branch_name = ?,
             branch_code = ?,
             opening_amount = ?,
             opp_amount = ?,
             cash_in_icba = ?,
             cash_out_icba = ?,
             note = ?,
             updated_at = datetime('now'),
             updated_by = ?
         WHERE company_id = ? AND id = ? AND status = 'OPEN'`,
      )
      .run(
        input.branchName,
        input.branchCode,
        input.openingAmount,
        input.oppAmount,
        input.cashInICBA,
        input.cashOutICBA,
        input.note,
        input.updatedBy,
        input.companyId,
        input.sessionId,
      );
    return result.changes > 0;
  }

  reopenSession(companyId: number, sessionId: number, updatedBy: number): boolean {
    const result = this.db
      .prepare(
        `UPDATE teller_sessions
         SET status = 'OPEN',
             closed_at = NULL,
             updated_at = datetime('now'),
             updated_by = ?
         WHERE company_id = ? AND id = ?`,
      )
      .run(updatedBy, companyId, sessionId);
    return result.changes > 0;
  }

  closeSession(companyId: number, sessionId: number, closedAt: string, updatedBy: number): boolean {
    const result = this.db
      .prepare(
        `UPDATE teller_sessions
         SET status = 'CLOSED',
             closed_at = ?,
             updated_at = ?,
             updated_by = ?
         WHERE company_id = ? AND id = ? AND status = 'OPEN'`,
      )
      .run(closedAt, closedAt, updatedBy, companyId, sessionId);
    return result.changes > 0;
  }

  replaceOpeningCounts(sessionId: number, companyId: number, lines: Array<{ denominationId: number; quantity: number }>): void {
    this.db.prepare('DELETE FROM teller_session_ht_denominations WHERE session_id = ?').run(sessionId);
    const insert = this.db.prepare(
      `INSERT INTO teller_session_ht_denominations (session_id, company_id, denomination_id, quantity)
       VALUES (?, ?, ?, ?)`,
    );
    for (const line of lines) {
      if (line.quantity === 0) {
        continue;
      }
      insert.run(sessionId, companyId, line.denominationId, line.quantity);
    }
  }

  listOpeningCounts(sessionId: number): Record<string, number> {
    const rows = this.db
      .prepare(
        `SELECT d.value, h.quantity
         FROM teller_session_ht_denominations h
         JOIN denominations d ON d.id = h.denomination_id
         WHERE h.session_id = ?`,
      )
      .all(sessionId) as Array<{ value: string; quantity: number }>;
    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.value] = row.quantity;
    }
    return counts;
  }

  insertTransaction(input: {
    companyId: number;
    sessionId: number;
    direction: TellerDirection;
    referenceLabel: string;
    declaredAmount: string | null;
    createdBy: number;
  }): number {
    const result = this.db
      .prepare(
        `INSERT INTO teller_transactions (
           company_id, session_id, direction, reference_label, declared_amount, created_by, updated_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.companyId,
        input.sessionId,
        input.direction,
        input.referenceLabel,
        input.declaredAmount,
        input.createdBy,
        input.createdBy,
      );
    return Number(result.lastInsertRowid);
  }

  updateTransaction(input: {
    companyId: number;
    transactionId: number;
    referenceLabel: string;
    declaredAmount: string | null;
    updatedBy: number;
  }): boolean {
    const result = this.db
      .prepare(
        `UPDATE teller_transactions
         SET reference_label = ?,
             declared_amount = ?,
             updated_at = datetime('now'),
             updated_by = ?
         WHERE company_id = ? AND id = ?`,
      )
      .run(input.referenceLabel, input.declaredAmount, input.updatedBy, input.companyId, input.transactionId);
    return result.changes > 0;
  }

  deleteTransaction(companyId: number, transactionId: number): boolean {
    const result = this.db
      .prepare('DELETE FROM teller_transactions WHERE company_id = ? AND id = ?')
      .run(companyId, transactionId);
    return result.changes > 0;
  }

  deleteSessionTransactions(companyId: number, sessionId: number): number {
    const result = this.db
      .prepare('DELETE FROM teller_transactions WHERE company_id = ? AND session_id = ?')
      .run(companyId, sessionId);
    return result.changes;
  }

  replaceTransactionCounts(
    transactionId: number,
    companyId: number,
    lines: Array<{ denominationId: number; quantity: number }>,
  ): void {
    this.db.prepare('DELETE FROM teller_transaction_denominations WHERE transaction_id = ?').run(transactionId);
    const insert = this.db.prepare(
      `INSERT INTO teller_transaction_denominations (transaction_id, company_id, denomination_id, quantity)
       VALUES (?, ?, ?, ?)`,
    );
    for (const line of lines) {
      if (line.quantity === 0) {
        continue;
      }
      insert.run(transactionId, companyId, line.denominationId, line.quantity);
    }
  }

  getTransaction(companyId: number, id: number): TellerTransactionRecord | undefined {
    return this.db
      .prepare(
        `SELECT t.id, t.company_id, t.session_id, t.direction, t.reference_label, t.declared_amount,
                t.created_at, t.created_by, t.updated_at, t.updated_by, s.currency_code
         FROM teller_transactions t
         JOIN teller_sessions s ON s.id = t.session_id
         WHERE t.company_id = ? AND t.id = ?`,
      )
      .get(companyId, id) as TellerTransactionRecord | undefined;
  }

  listSessionTransactions(sessionId: number, direction?: TellerDirection): TellerTransactionRecord[] {
    if (direction) {
      return this.db
        .prepare(
          `SELECT id, company_id, session_id, direction, reference_label, declared_amount,
                  created_at, created_by, updated_at, updated_by
           FROM teller_transactions
           WHERE session_id = ? AND direction = ?
           ORDER BY id ASC`,
        )
        .all(sessionId, direction) as TellerTransactionRecord[];
    }
    return this.db
      .prepare(
        `SELECT id, company_id, session_id, direction, reference_label, declared_amount,
                created_at, created_by, updated_at, updated_by
         FROM teller_transactions
         WHERE session_id = ?
         ORDER BY id ASC`,
      )
      .all(sessionId) as TellerTransactionRecord[];
  }

  listTransactionCounts(transactionId: number): Record<string, number> {
    const rows = this.db
      .prepare(
        `SELECT d.value, n.quantity
         FROM teller_transaction_denominations n
         JOIN denominations d ON d.id = n.denomination_id
         WHERE n.transaction_id = ?`,
      )
      .all(transactionId) as Array<{ value: string; quantity: number }>;
    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.value] = row.quantity;
    }
    return counts;
  }

  countTransactions(filters: TellerListFilters): number {
    const { where, params } = buildListWhere(filters);
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM teller_transactions t
         JOIN teller_sessions s ON s.id = t.session_id
         ${where}`,
      )
      .get(...params) as { count: number };
    return row.count;
  }

  listTransactions(filters: TellerListFilters, limit: number, offset: number): TellerTransactionRecord[] {
    const { where, params } = buildListWhere(filters);
    return this.db
      .prepare(
        `SELECT t.id, t.company_id, t.session_id, t.direction, t.reference_label, t.declared_amount,
                t.created_at, t.created_by, t.updated_at, t.updated_by, s.currency_code
         FROM teller_transactions t
         JOIN teller_sessions s ON s.id = t.session_id
         ${where}
         ORDER BY datetime(t.created_at) DESC, t.id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as TellerTransactionRecord[];
  }

  currencyActive(code: string): boolean {
    const row = this.db
      .prepare('SELECT code FROM currencies WHERE code = ? AND is_active = 1')
      .get(code) as { code: string } | undefined;
    return row !== undefined;
  }

  currencyExists(code: string): boolean {
    const row = this.db.prepare('SELECT code FROM currencies WHERE code = ?').get(code) as
      | { code: string }
      | undefined;
    return row !== undefined;
  }
}

function toSession(row: TellerSessionRecord, openingCounts: Record<string, number>): TellerSession {
  return {
    id: row.id,
    companyId: row.company_id,
    tellerUserId: row.teller_user_id,
    tellerUsername: row.teller_username ?? null,
    currencyCode: row.currency_code,
    sessionDate: row.session_date,
    branchName: row.branch_name,
    branchCode: row.branch_code,
    openingAmount: row.opening_amount,
    openingCounts,
    oppAmount: row.opp_amount,
    cashInICBA: row.cash_in_icba,
    cashOutICBA: row.cash_out_icba,
    status: row.status,
    note: row.note,
    createdAt: row.created_at,
    closedAt: row.closed_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

function buildListWhere(filters: TellerListFilters): { where: string; params: unknown[] } {
  const clauses = ['t.company_id = ?'];
  const params: unknown[] = [filters.companyId];

  if (filters.sessionId !== undefined) {
    clauses.push('t.session_id = ?');
    params.push(filters.sessionId);
  }
  if (filters.currencyCode) {
    clauses.push('s.currency_code = ?');
    params.push(filters.currencyCode);
  }
  if (filters.direction) {
    clauses.push('t.direction = ?');
    params.push(filters.direction);
  }
  if (filters.referenceLabel) {
    clauses.push('t.reference_label LIKE ?');
    params.push(`%${filters.referenceLabel}%`);
  }
  if (filters.dateFrom) {
    clauses.push('datetime(t.created_at) >= datetime(?)');
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    clauses.push('datetime(t.created_at) <= datetime(?)');
    params.push(filters.dateTo);
  }

  return { where: `WHERE ${clauses.join(' AND ')}`, params };
}
