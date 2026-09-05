import type Database from 'better-sqlite3';
import Decimal from 'decimal.js';
import type { TransactionType } from '@shared/types/transaction';
import type { TransferRole } from '@shared/types/transfer';
import { AppError } from '../../utils/errors';

export interface TransactionRecord {
  id: number;
  customer_id: number;
  type: TransactionType;
  currency_code: string;
  amount: string;
  note: string | null;
  transaction_date: string;
  created_at: string;
  updated_at: string;
  transfer_id: string | null;
  transfer_role: TransferRole | null;
  counterparty_customer_id: number | null;
  counterparty_name?: string | null;
}

export interface CreateTransactionRecordInput {
  customerId: number;
  type: TransactionType;
  currencyCode: string;
  amount: string;
  note: string | null;
  transactionDate: string;
  transferId?: string | null;
  transferRole?: TransferRole | null;
  counterpartyCustomerId?: number | null;
}

export interface UpdateTransactionRecordInput {
  type: TransactionType;
  currencyCode: string;
  amount: string;
  note: string | null;
  transactionDate: string;
}

export interface TransactionAmountRow {
  customer_id: number;
  type: TransactionType;
  currency_code: string;
  amount: string;
}

export interface TransactionAggregateRow {
  customer_id: number;
  currency_code: string;
  type: TransactionType;
  tx_count: number;
  total_amount: string;
}

export interface GlobalTransactionAggregateRow {
  currency_code: string;
  type: TransactionType;
  tx_count: number;
  total_amount: string;
}

export interface ReportTransactionRecord extends TransactionRecord {
  customer_name: string | null;
  customer_number: string | null;
}

export interface ReportTransactionQuery {
  customerId?: number;
  startDate?: string;
  endDate?: string;
}

const COLUMNS = `id, customer_id, type, currency_code, amount, note, transaction_date, created_at, updated_at, transfer_id, transfer_role, counterparty_customer_id`;
const HISTORY_ORDER = `ORDER BY datetime(transaction_date) DESC, id DESC`;
const AGGREGATE_AMOUNT = `decimal_sum(amount)`;
const registeredDatabases = new WeakSet<Database.Database>();
// More than enough precision for every supported amount and SQLite row count.
const ExactDecimal = Decimal.clone({ precision: 80 });

export class TransactionRepository {
  constructor(private readonly db: Database.Database) {
    if (!registeredDatabases.has(db)) {
      db.aggregate('decimal_sum', {
        start: () => new ExactDecimal(0),
        step: (total: Decimal, amount: unknown) => {
          if (amount === null) return total;
          if (typeof amount !== 'string') throw new Error('Money must be stored as decimal TEXT');
          return total.plus(amount);
        },
        result: (total: Decimal) => total.toFixed(4),
      });
      registeredDatabases.add(db);
    }
  }

  createTransaction(input: CreateTransactionRecordInput): number {
    const result = this.db
      .prepare(
        `INSERT INTO transactions (
           customer_id, type, currency_code, amount, note, transaction_date,
           transfer_id, transfer_role, counterparty_customer_id
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.customerId,
        input.type,
        input.currencyCode,
        input.amount,
        input.note,
        input.transactionDate,
        input.transferId ?? null,
        input.transferRole ?? null,
        input.counterpartyCustomerId ?? null,
      );
    return Number(result.lastInsertRowid);
  }

  createTransferPair(
    outgoing: CreateTransactionRecordInput,
    incoming: CreateTransactionRecordInput,
  ): { outId: number; inId: number } {
    return this.db.transaction(() => {
      const balance = this.balanceForCustomerCurrency(outgoing.customerId, outgoing.currencyCode);
      if (new Decimal(balance).lt(new Decimal(outgoing.amount))) {
        throw new AppError('INSUFFICIENT_BALANCE', 'INSUFFICIENT_BALANCE');
      }

      return {
        outId: this.createTransaction(outgoing),
        inId: this.createTransaction(incoming),
      };
    })();
  }

  private balanceForCustomerCurrency(customerId: number, currencyCode: string): string {
    const row = this.db
      .prepare(
        `SELECT
           decimal_sum(CASE WHEN type = 'CASH_IN' THEN amount ELSE '-' || amount END) AS balance
         FROM transactions
         WHERE customer_id = ? AND currency_code = ?`,
      )
      .get(customerId, currencyCode) as { balance: string };
    return row.balance;
  }

  deleteByTransferId(transferId: string): number {
    const result = this.db.prepare('DELETE FROM transactions WHERE transfer_id = ?').run(transferId);
    return result.changes;
  }

  getTransactionById(id: number): TransactionRecord | undefined {
    return this.db
      .prepare(
        `SELECT ${COLUMNS},
                (SELECT name FROM customers WHERE id = transactions.counterparty_customer_id) AS counterparty_name
         FROM transactions WHERE id = ?`,
      )
      .get(id) as TransactionRecord | undefined;
  }

  countByCustomer(customerId: number): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS count FROM transactions WHERE customer_id = ?')
      .get(customerId) as { count: number };
    return row.count;
  }

  listByCustomer(customerId: number, limit: number, offset: number): TransactionRecord[] {
    return this.db
      .prepare(
        `SELECT ${COLUMNS},
                (SELECT name FROM customers WHERE id = transactions.counterparty_customer_id) AS counterparty_name
         FROM transactions
         WHERE customer_id = ?
         ${HISTORY_ORDER}
         LIMIT ? OFFSET ?`,
      )
      .all(customerId, limit, offset) as TransactionRecord[];
  }

  updateTransaction(id: number, input: UpdateTransactionRecordInput): boolean {
    const result = this.db
      .prepare(
        `UPDATE transactions
         SET type = ?,
             currency_code = ?,
             amount = ?,
             note = ?,
             transaction_date = ?,
             updated_at = CASE
               WHEN datetime('now') = created_at THEN datetime(created_at, '+1 second')
               ELSE datetime('now')
             END
         WHERE id = ?`,
      )
      .run(
        input.type,
        input.currencyCode,
        input.amount,
        input.note,
        input.transactionDate,
        id,
      );
    return result.changes > 0;
  }

  deleteTransaction(id: number): boolean {
    const result = this.db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
    return result.changes > 0;
  }

  listAmountRows(customerId?: number, dateRange?: { startDate?: string; endDate?: string }): TransactionAmountRow[] {
    return this.listFilteredRows(
      'SELECT customer_id, type, currency_code, amount FROM transactions',
      { customerId, startDate: dateRange?.startDate, endDate: dateRange?.endDate },
    ) as TransactionAmountRow[];
  }

  aggregateForCustomers(customerIds: number[]): TransactionAggregateRow[] {
    if (customerIds.length === 0) {
      return [];
    }

    const placeholders = customerIds.map(() => '?').join(', ');
    return this.db
      .prepare(
        `SELECT customer_id, currency_code, type, COUNT(*) AS tx_count, ${AGGREGATE_AMOUNT} AS total_amount
         FROM transactions
         WHERE customer_id IN (${placeholders})
         GROUP BY customer_id, currency_code, type`,
      )
      .all(...customerIds) as TransactionAggregateRow[];
  }

  aggregateForCustomer(customerId: number): TransactionAggregateRow[] {
    return this.aggregateForCustomers([customerId]);
  }

  aggregateGlobal(): GlobalTransactionAggregateRow[] {
    return this.db
      .prepare(
        `SELECT currency_code, type, COUNT(*) AS tx_count, ${AGGREGATE_AMOUNT} AS total_amount
         FROM transactions
         GROUP BY currency_code, type`,
      )
      .all() as GlobalTransactionAggregateRow[];
  }

  countDistinctCustomersByCurrency(): Array<{ currency_code: string; customer_count: number }> {
    return this.db
      .prepare(
        `SELECT currency_code, COUNT(DISTINCT customer_id) AS customer_count
         FROM transactions
         GROUP BY currency_code`,
      )
      .all() as Array<{ currency_code: string; customer_count: number }>;
  }

  aggregateAllCustomers(): TransactionAggregateRow[] {
    return this.db
      .prepare(
        `SELECT customer_id, currency_code, type, COUNT(*) AS tx_count, ${AGGREGATE_AMOUNT} AS total_amount
         FROM transactions
         GROUP BY customer_id, currency_code, type`,
      )
      .all() as TransactionAggregateRow[];
  }

  aggregateForReportScope(query: ReportTransactionQuery): TransactionAggregateRow[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (query.customerId !== undefined) {
      clauses.push('customer_id = ?');
      params.push(query.customerId);
    }
    if (query.startDate) {
      clauses.push('date(transaction_date) >= date(?)');
      params.push(query.startDate);
    }
    if (query.endDate) {
      clauses.push('date(transaction_date) <= date(?)');
      params.push(query.endDate);
    }

    const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
    return this.db
      .prepare(
        `SELECT customer_id, currency_code, type, COUNT(*) AS tx_count, ${AGGREGATE_AMOUNT} AS total_amount
         FROM transactions${where}
         GROUP BY customer_id, currency_code, type`,
      )
      .all(...params) as TransactionAggregateRow[];
  }

  listForReport(query: ReportTransactionQuery): ReportTransactionRecord[] {
    return this.listFilteredRows(
      `SELECT t.id, t.customer_id, t.type, t.currency_code, t.amount, t.note, t.transaction_date,
              t.created_at, t.updated_at, t.transfer_id, t.transfer_role, t.counterparty_customer_id,
              c.name AS customer_name, c.customer_number AS customer_number,
              cp.name AS counterparty_name
       FROM transactions t
       INNER JOIN customers c ON c.id = t.customer_id
       LEFT JOIN customers cp ON cp.id = t.counterparty_customer_id`,
      query,
      't.',
    ) as ReportTransactionRecord[];
  }

  findPossibleDuplicate(input: {
    customerNumber: string | null;
    customerName: string | null;
    type: TransactionType;
    currencyCode: string;
    amount: string;
    date: string;
  }): boolean {
    const dateKey = input.date.slice(0, 10);
    if (input.customerNumber) {
      const row = this.db
        .prepare(
          `SELECT 1 AS present
           FROM transactions t
           INNER JOIN customers c ON c.id = t.customer_id
           WHERE t.type = ?
             AND t.currency_code = ?
             AND t.amount = ?
             AND date(t.transaction_date) = date(?)
             AND c.customer_number = ? COLLATE NOCASE
           LIMIT 1`,
        )
        .get(input.type, input.currencyCode, input.amount, dateKey, input.customerNumber) as
        | { present: number }
        | undefined;
      return row !== undefined;
    }

    if (!input.customerName) {
      return false;
    }

    const row = this.db
      .prepare(
        `SELECT 1 AS present
         FROM transactions t
         INNER JOIN customers c ON c.id = t.customer_id
         WHERE t.type = ?
           AND t.currency_code = ?
           AND t.amount = ?
           AND date(t.transaction_date) = date(?)
           AND c.name = ? COLLATE NOCASE
         LIMIT 1`,
      )
      .get(input.type, input.currencyCode, input.amount, dateKey, input.customerName) as
      | { present: number }
      | undefined;
    return row !== undefined;
  }

  private listFilteredRows(
    selectSql: string,
    query: ReportTransactionQuery,
    tablePrefix = '',
  ): unknown[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (query.customerId !== undefined) {
      clauses.push(`${tablePrefix}customer_id = ?`);
      params.push(query.customerId);
    }
    if (query.startDate) {
      clauses.push(`date(${tablePrefix}transaction_date) >= date(?)`);
      params.push(query.startDate);
    }
    if (query.endDate) {
      clauses.push(`date(${tablePrefix}transaction_date) <= date(?)`);
      params.push(query.endDate);
    }

    const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
    const order = ` ORDER BY datetime(${tablePrefix}transaction_date) DESC, ${tablePrefix}id DESC`;
    return this.db.prepare(`${selectSql}${where}${order}`).all(...params);
  }

  getSetting(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value;
  }
}
