import type Database from 'better-sqlite3';
import type {
  TellerDenomination,
  TellerDirection,
  TellerPartyKind,
  TellerSession,
  TellerSessionStatus,
  TellerTransactionType,
  TellerTransactionTypeCode,
} from '@shared/types/teller';
import { nowSqliteDateTime } from '@shared/transactionDateTime';

export interface TellerSessionRecord {
  id: number;
  company_id: number;
  teller_user_id: number;
  teller_username?: string | null;
  opened_at: string;
  closed_at: string | null;
  status: TellerSessionStatus;
  note: string | null;
  created_at: string;
  created_by: number;
  updated_at: string;
  updated_by: number | null;
}

export interface TellerTypeRecord {
  code: TellerTransactionTypeCode;
  name_key: string;
  direction: TellerDirection;
  party_kind: TellerPartyKind;
  sort_order: number;
}

export interface TellerDenominationRecord {
  id: number;
  currency_code: string;
  value: string;
  sort_order: number;
  is_active: number;
}

export interface TellerTransactionRecord {
  id: number;
  company_id: number;
  session_id: number;
  teller_user_id: number;
  transaction_number: string;
  type_code: TellerTransactionTypeCode;
  direction: TellerDirection;
  party_kind: TellerPartyKind;
  currency_code: string;
  customer_id: number | null;
  customer_name: string | null;
  customer_number: string | null;
  amount: string;
  denomination_total: string;
  running_balance: string;
  validation_status: 'OK';
  note: string | null;
  transaction_date: string;
  created_at: string;
  created_by: number;
  updated_at: string;
  updated_by: number | null;
}

export interface TellerDenomLineRecord {
  denomination_id: number;
  currency_code: string;
  value: string;
  quantity: number;
  unit_value: string;
  line_total: string;
}

export interface TellerPositionRecord {
  denomination_id: number;
  currency_code: string;
  value: string;
  quantity: number;
}

export interface TellerSessionTotalsRecord {
  session_id: number;
  currency_code: string;
  cash_in_amount: string;
  cash_out_amount: string;
  cash_in_count: number;
  cash_out_count: number;
}

export interface TellerOpeningLineRecord {
  denomination_id: number;
  currency_code: string;
  value: string;
  quantity: number;
  unit_value: string;
  line_total: string;
}

export interface TellerListFilters {
  companyId: number;
  sessionId?: number;
  currencyCode?: string;
  typeCode?: string;
  direction?: 'IN' | 'OUT';
  customerId?: number;
  transactionNumber?: string;
  dateFrom?: string;
  dateTo?: string;
  tellerUserId?: number;
}

const TX_SELECT = `t.id, t.company_id, t.session_id, t.teller_user_id, t.transaction_number, t.type_code,
  ty.direction, ty.party_kind, t.currency_code, t.customer_id, c.name AS customer_name, c.customer_number,
  t.amount, t.denomination_total, t.running_balance, t.validation_status, t.note, t.transaction_date,
  t.created_at, t.created_by, t.updated_at, t.updated_by`;

export class TellerRepository {
  constructor(private readonly db: Database.Database) {}

  resolveCompanyId(): number {
    const row = this.db.prepare('SELECT id FROM company_profile WHERE id = 1').get() as
      | { id: number }
      | undefined;
    return row?.id ?? 1;
  }

  listTypes(): TellerTransactionType[] {
    const rows = this.db
      .prepare(
        `SELECT code, name_key, direction, party_kind, sort_order
         FROM teller_transaction_types
         ORDER BY sort_order ASC, code ASC`,
      )
      .all() as TellerTypeRecord[];
    return rows.map((row) => ({
      code: row.code,
      nameKey: row.name_key,
      direction: row.direction,
      partyKind: row.party_kind,
      sortOrder: row.sort_order,
    }));
  }

  getType(code: string): TellerTransactionType | undefined {
    const row = this.db
      .prepare(
        `SELECT code, name_key, direction, party_kind, sort_order
         FROM teller_transaction_types WHERE code = ?`,
      )
      .get(code) as TellerTypeRecord | undefined;
    if (!row) {
      return undefined;
    }
    return {
      code: row.code,
      nameKey: row.name_key,
      direction: row.direction,
      partyKind: row.party_kind,
      sortOrder: row.sort_order,
    };
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
          .all(currencyCode) as TellerDenominationRecord[])
      : (this.db
          .prepare(
            `SELECT id, currency_code, value, sort_order, is_active
             FROM denominations
             WHERE is_active = 1
             ORDER BY currency_code ASC, sort_order ASC, id ASC`,
          )
          .all() as TellerDenominationRecord[]);

    return rows.map(toDenomination);
  }

  getDenomination(id: number): TellerDenomination | undefined {
    const row = this.db
      .prepare(
        `SELECT id, currency_code, value, sort_order, is_active
         FROM denominations WHERE id = ?`,
      )
      .get(id) as TellerDenominationRecord | undefined;
    return row ? toDenomination(row) : undefined;
  }

  getOpenSession(companyId: number): TellerSession | undefined {
    const row = this.db
      .prepare(
        `SELECT s.id, s.company_id, s.teller_user_id, u.username AS teller_username,
                s.opened_at, s.closed_at, s.status, s.note,
                s.created_at, s.created_by, s.updated_at, s.updated_by
         FROM teller_sessions s
         LEFT JOIN admin_users u ON u.id = s.teller_user_id
         WHERE s.company_id = ? AND s.status = 'OPEN'
         LIMIT 1`,
      )
      .get(companyId) as TellerSessionRecord | undefined;
    return row ? toSession(row) : undefined;
  }

  getSession(companyId: number, sessionId: number): TellerSession | undefined {
    const row = this.db
      .prepare(
        `SELECT s.id, s.company_id, s.teller_user_id, u.username AS teller_username,
                s.opened_at, s.closed_at, s.status, s.note,
                s.created_at, s.created_by, s.updated_at, s.updated_by
         FROM teller_sessions s
         LEFT JOIN admin_users u ON u.id = s.teller_user_id
         WHERE s.company_id = ? AND s.id = ?
         LIMIT 1`,
      )
      .get(companyId, sessionId) as TellerSessionRecord | undefined;
    return row ? toSession(row) : undefined;
  }

  insertSession(input: {
    companyId: number;
    tellerUserId: number;
    openedAt: string;
    note: string | null;
    createdBy: number;
  }): number {
    const result = this.db
      .prepare(
        `INSERT INTO teller_sessions (
           company_id, teller_user_id, opened_at, status, note, created_by, updated_by
         ) VALUES (?, ?, ?, 'OPEN', ?, ?, ?)`,
      )
      .run(
        input.companyId,
        input.tellerUserId,
        input.openedAt,
        input.note,
        input.createdBy,
        input.createdBy,
      );
    return Number(result.lastInsertRowid);
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

  insertOpeningLine(input: {
    sessionId: number;
    companyId: number;
    denominationId: number;
    quantity: number;
    unitValue: string;
    lineTotal: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO teller_session_opening_denominations (
           session_id, company_id, denomination_id, quantity, unit_value, line_total
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.sessionId,
        input.companyId,
        input.denominationId,
        input.quantity,
        input.unitValue,
        input.lineTotal,
      );
  }

  listOpeningLines(companyId: number, sessionId: number): TellerOpeningLineRecord[] {
    return this.db
      .prepare(
        `SELECT o.denomination_id, d.currency_code, d.value, o.quantity, o.unit_value, o.line_total
         FROM teller_session_opening_denominations o
         JOIN denominations d ON d.id = o.denomination_id
         WHERE o.company_id = ? AND o.session_id = ?
         ORDER BY d.currency_code ASC, d.sort_order ASC, d.id ASC`,
      )
      .all(companyId, sessionId) as TellerOpeningLineRecord[];
  }

  getPosition(companyId: number, denominationId: number): number {
    const row = this.db
      .prepare(
        `SELECT quantity FROM teller_cash_positions
         WHERE company_id = ? AND denomination_id = ?`,
      )
      .get(companyId, denominationId) as { quantity: number } | undefined;
    return row?.quantity ?? 0;
  }

  listPositions(companyId: number, currencyCode?: string): TellerPositionRecord[] {
    if (currencyCode) {
      return this.db
        .prepare(
          `SELECT p.denomination_id, d.currency_code, d.value, p.quantity
           FROM teller_cash_positions p
           JOIN denominations d ON d.id = p.denomination_id
           WHERE p.company_id = ? AND d.currency_code = ?
           ORDER BY d.sort_order ASC, d.id ASC`,
        )
        .all(companyId, currencyCode) as TellerPositionRecord[];
    }
    return this.db
      .prepare(
        `SELECT p.denomination_id, d.currency_code, d.value, p.quantity
         FROM teller_cash_positions p
         JOIN denominations d ON d.id = p.denomination_id
         WHERE p.company_id = ?
         ORDER BY d.currency_code ASC, d.sort_order ASC, d.id ASC`,
      )
      .all(companyId) as TellerPositionRecord[];
  }

  setPosition(companyId: number, denominationId: number, quantity: number): void {
    this.db
      .prepare(
        `INSERT INTO teller_cash_positions (company_id, denomination_id, quantity, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(company_id, denomination_id)
         DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at`,
      )
      .run(companyId, denominationId, quantity);
  }

  nextTransactionSequence(companyId: number): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(MAX(CAST(SUBSTR(transaction_number, 4) AS INTEGER)), 0) AS max_seq
         FROM teller_transactions
         WHERE company_id = ?`,
      )
      .get(companyId) as { max_seq: number };
    return row.max_seq + 1;
  }

  insertTransaction(input: {
    companyId: number;
    sessionId: number;
    tellerUserId: number;
    transactionNumber: string;
    typeCode: string;
    currencyCode: string;
    customerId: number | null;
    amount: string;
    denominationTotal: string;
    runningBalance: string;
    note: string | null;
    transactionDate: string;
    createdBy: number;
  }): number {
    const result = this.db
      .prepare(
        `INSERT INTO teller_transactions (
           company_id, session_id, teller_user_id, transaction_number, type_code, currency_code,
           customer_id, amount, denomination_total, running_balance, validation_status, note,
           transaction_date, created_by, updated_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OK', ?, ?, ?, ?)`,
      )
      .run(
        input.companyId,
        input.sessionId,
        input.tellerUserId,
        input.transactionNumber,
        input.typeCode,
        input.currencyCode,
        input.customerId,
        input.amount,
        input.denominationTotal,
        input.runningBalance,
        input.note,
        input.transactionDate,
        input.createdBy,
        input.createdBy,
      );
    return Number(result.lastInsertRowid);
  }

  insertDenominationLine(input: {
    companyId: number;
    transactionId: number;
    denominationId: number;
    quantity: number;
    unitValue: string;
    lineTotal: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO teller_transaction_denominations (
           company_id, transaction_id, denomination_id, quantity, unit_value, line_total
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.companyId,
        input.transactionId,
        input.denominationId,
        input.quantity,
        input.unitValue,
        input.lineTotal,
      );
  }

  getLastRunningBalance(
    companyId: number,
    sessionId: number,
    currencyCode: string,
  ): string | undefined {
    const row = this.db
      .prepare(
        `SELECT running_balance
         FROM teller_transactions
         WHERE company_id = ? AND session_id = ? AND currency_code = ?
           AND type_code != 'OPENING_BALANCE'
         ORDER BY datetime(transaction_date) DESC, id DESC
         LIMIT 1`,
      )
      .get(companyId, sessionId, currencyCode) as { running_balance: string } | undefined;
    return row?.running_balance;
  }

  getTransaction(companyId: number, id: number): TellerTransactionRecord | undefined {
    return this.db
      .prepare(
        `SELECT ${TX_SELECT}
         FROM teller_transactions t
         JOIN teller_transaction_types ty ON ty.code = t.type_code
         LEFT JOIN customers c ON c.id = t.customer_id
         WHERE t.company_id = ? AND t.id = ?`,
      )
      .get(companyId, id) as TellerTransactionRecord | undefined;
  }

  listTransactionDenoms(companyId: number, transactionId: number): TellerDenomLineRecord[] {
    return this.db
      .prepare(
        `SELECT d.denomination_id, n.currency_code, n.value, d.quantity, d.unit_value, d.line_total
         FROM teller_transaction_denominations d
         JOIN denominations n ON n.id = d.denomination_id
         WHERE d.company_id = ? AND d.transaction_id = ?
         ORDER BY n.sort_order ASC, n.id ASC`,
      )
      .all(companyId, transactionId) as TellerDenomLineRecord[];
  }

  countTransactions(filters: TellerListFilters): number {
    const { sql, params } = buildListWhere(filters);
    const row = this.db.prepare(`SELECT COUNT(*) AS count FROM teller_transactions t ${sql}`).get(
      ...params,
    ) as { count: number };
    return row.count;
  }

  listTransactions(
    filters: TellerListFilters,
    limit: number,
    offset: number,
  ): TellerTransactionRecord[] {
    const { sql, params } = buildListWhere(filters);
    return this.db
      .prepare(
        `SELECT ${TX_SELECT}
         FROM teller_transactions t
         JOIN teller_transaction_types ty ON ty.code = t.type_code
         LEFT JOIN customers c ON c.id = t.customer_id
         ${sql}
         ORDER BY datetime(t.transaction_date) DESC, t.id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as TellerTransactionRecord[];
  }

  countLongBookMovements(companyId: number, sessionId: number, currencyCode: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM teller_transactions t
         JOIN teller_transaction_types ty ON ty.code = t.type_code
         WHERE t.company_id = ? AND t.session_id = ? AND t.currency_code = ?
           AND ty.direction IN ('IN', 'OUT')`,
      )
      .get(companyId, sessionId, currencyCode) as { count: number };
    return row.count;
  }

  listLongBookMovements(
    companyId: number,
    sessionId: number,
    currencyCode: string,
    limit?: number,
    offset?: number,
  ): TellerTransactionRecord[] {
    if (limit !== undefined && offset !== undefined) {
      return this.db
        .prepare(
          `SELECT ${TX_SELECT}
           FROM teller_transactions t
           JOIN teller_transaction_types ty ON ty.code = t.type_code
           LEFT JOIN customers c ON c.id = t.customer_id
           WHERE t.company_id = ? AND t.session_id = ? AND t.currency_code = ?
             AND ty.direction IN ('IN', 'OUT')
           ORDER BY datetime(t.transaction_date) ASC, t.id ASC
           LIMIT ? OFFSET ?`,
        )
        .all(companyId, sessionId, currencyCode, limit, offset) as TellerTransactionRecord[];
    }
    return this.db
      .prepare(
        `SELECT ${TX_SELECT}
         FROM teller_transactions t
         JOIN teller_transaction_types ty ON ty.code = t.type_code
         LEFT JOIN customers c ON c.id = t.customer_id
         WHERE t.company_id = ? AND t.session_id = ? AND t.currency_code = ?
           AND ty.direction IN ('IN', 'OUT')
         ORDER BY datetime(t.transaction_date) ASC, t.id ASC`,
      )
      .all(companyId, sessionId, currencyCode) as TellerTransactionRecord[];
  }

  listDashboardCurrencies(
    companyId: number,
    sessionId: number | null,
  ): Array<{ code: string; display_name: string | null; name_key: string; symbol: string | null }> {
    return this.db
      .prepare(
        `SELECT c.code, c.display_name, c.name_key, c.symbol
         FROM currencies c
         WHERE c.is_active = 1
            OR EXISTS (
              SELECT 1 FROM teller_session_currency_totals tot
              WHERE tot.currency_code = c.code AND tot.company_id = ? AND (? IS NULL OR tot.session_id = ?)
            )
            OR EXISTS (
              SELECT 1 FROM teller_cash_positions p
              JOIN denominations d ON d.id = p.denomination_id
              WHERE d.currency_code = c.code AND p.company_id = ? AND p.quantity > 0
            )
         ORDER BY c.sort_order ASC, c.code ASC`,
      )
      .all(companyId, sessionId, sessionId, companyId) as Array<{
      code: string;
      display_name: string | null;
      name_key: string;
      symbol: string | null;
    }>;
  }

  listSessionTypeCounts(
    companyId: number,
    sessionId: number,
    currencyCode: string,
  ): Array<{ type_code: string; count: number }> {
    return this.db
      .prepare(
        `SELECT type_code, COUNT(*) AS count
         FROM teller_transactions
         WHERE company_id = ? AND session_id = ? AND currency_code = ?
           AND type_code != 'OPENING_BALANCE'
         GROUP BY type_code`,
      )
      .all(companyId, sessionId, currencyCode) as Array<{ type_code: string; count: number }>;
  }

  getLastMovement(
    companyId: number,
    sessionId: number,
    currencyCode: string,
  ): TellerTransactionRecord | undefined {
    return this.db
      .prepare(
        `SELECT ${TX_SELECT}
         FROM teller_transactions t
         JOIN teller_transaction_types ty ON ty.code = t.type_code
         LEFT JOIN customers c ON c.id = t.customer_id
         WHERE t.company_id = ? AND t.session_id = ? AND t.currency_code = ?
           AND ty.direction IN ('IN', 'OUT')
         ORDER BY datetime(t.transaction_date) DESC, t.id DESC
         LIMIT 1`,
      )
      .get(companyId, sessionId, currencyCode) as TellerTransactionRecord | undefined;
  }

  listDenominationsForTally(currencyCode: string): TellerDenomination[] {
    const rows = this.db
      .prepare(
        `SELECT id, currency_code, value, sort_order, is_active
         FROM denominations
         WHERE currency_code = ?
         ORDER BY sort_order ASC, id ASC`,
      )
      .all(currencyCode) as TellerDenominationRecord[];
    return rows.map(toDenomination);
  }

  listSessionInOutDenoms(
    companyId: number,
    sessionId: number,
  ): Array<{ denomination_id: number; direction: 'IN' | 'OUT'; quantity: number }> {
    return this.db
      .prepare(
        `SELECT d.denomination_id, ty.direction AS direction, SUM(d.quantity) AS quantity
         FROM teller_transaction_denominations d
         JOIN teller_transactions t ON t.id = d.transaction_id
         JOIN teller_transaction_types ty ON ty.code = t.type_code
         WHERE t.company_id = ? AND t.session_id = ? AND ty.direction IN ('IN', 'OUT')
         GROUP BY d.denomination_id, ty.direction`,
      )
      .all(companyId, sessionId) as Array<{
      denomination_id: number;
      direction: 'IN' | 'OUT';
      quantity: number;
    }>;
  }

  getSessionTotals(companyId: number, sessionId: number): TellerSessionTotalsRecord[] {
    return this.db
      .prepare(
        `SELECT session_id, currency_code, cash_in_amount, cash_out_amount, cash_in_count, cash_out_count
         FROM teller_session_currency_totals
         WHERE company_id = ? AND session_id = ?`,
      )
      .all(companyId, sessionId) as TellerSessionTotalsRecord[];
  }

  upsertSessionTotals(input: {
    sessionId: number;
    companyId: number;
    currencyCode: string;
    cashInAmount: string;
    cashOutAmount: string;
    cashInCount: number;
    cashOutCount: number;
  }): void {
    this.db
      .prepare(
        `INSERT INTO teller_session_currency_totals (
           session_id, company_id, currency_code, cash_in_amount, cash_out_amount, cash_in_count, cash_out_count
         ) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(session_id, currency_code)
         DO UPDATE SET
           cash_in_amount = excluded.cash_in_amount,
           cash_out_amount = excluded.cash_out_amount,
           cash_in_count = excluded.cash_in_count,
           cash_out_count = excluded.cash_out_count`,
      )
      .run(
        input.sessionId,
        input.companyId,
        input.currencyCode,
        input.cashInAmount,
        input.cashOutAmount,
        input.cashInCount,
        input.cashOutCount,
      );
  }

  customerExists(customerId: number): boolean {
    const row = this.db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId) as
      | { id: number }
      | undefined;
    return row !== undefined;
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

  getCurrencyMeta(code: string): { displayName: string; symbol: string } {
    const row = this.db
      .prepare('SELECT display_name, symbol FROM currencies WHERE code = ?')
      .get(code) as { display_name: string | null; symbol: string | null } | undefined;
    return {
      displayName: (row?.display_name ?? '').trim() || code,
      symbol: row?.symbol ?? '',
    };
  }

  hasCurrencyUsage(code: string): boolean {
    const row = this.db
      .prepare('SELECT 1 AS present FROM teller_transactions WHERE currency_code = ? LIMIT 1')
      .get(code) as { present: number } | undefined;
    return row !== undefined;
  }
}

function toDenomination(row: TellerDenominationRecord): TellerDenomination {
  return {
    id: row.id,
    currencyCode: row.currency_code,
    value: row.value,
    sortOrder: row.sort_order,
    isActive: row.is_active === 1,
  };
}

function toSession(row: TellerSessionRecord): TellerSession {
  return {
    id: row.id,
    companyId: row.company_id,
    tellerUserId: row.teller_user_id,
    tellerUsername: row.teller_username ?? null,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    status: row.status,
    note: row.note,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

function buildListWhere(filters: TellerListFilters): { sql: string; params: unknown[] } {
  const clauses = ['t.company_id = ?'];
  const params: unknown[] = [filters.companyId];

  if (filters.sessionId !== undefined) {
    clauses.push('t.session_id = ?');
    params.push(filters.sessionId);
  }
  if (filters.currencyCode) {
    clauses.push('t.currency_code = ?');
    params.push(filters.currencyCode);
  }
  if (filters.typeCode) {
    clauses.push('t.type_code = ?');
    params.push(filters.typeCode);
  }
  if (filters.direction) {
    clauses.push(
      `EXISTS (
         SELECT 1 FROM teller_transaction_types tyf
         WHERE tyf.code = t.type_code AND tyf.direction = ?
       )`,
    );
    params.push(filters.direction);
  }
  if (filters.customerId !== undefined) {
    clauses.push('t.customer_id = ?');
    params.push(filters.customerId);
  }
  if (filters.transactionNumber) {
    clauses.push('t.transaction_number LIKE ?');
    params.push(`%${filters.transactionNumber}%`);
  }
  if (filters.dateFrom) {
    clauses.push('datetime(t.transaction_date) >= datetime(?)');
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    clauses.push('datetime(t.transaction_date) <= datetime(?)');
    params.push(filters.dateTo);
  }
  if (filters.tellerUserId !== undefined) {
    clauses.push('t.teller_user_id = ?');
    params.push(filters.tellerUserId);
  }

  return { sql: `WHERE ${clauses.join(' AND ')}`, params };
}

export function formatTransactionNumber(sequence: number): string {
  return `TL-${String(sequence).padStart(6, '0')}`;
}

export { nowSqliteDateTime };
