import type Database from 'better-sqlite3';
import type { Currency, CurrencyDenomination } from '@shared/types/currency';

interface CurrencyRecord {
  code: string;
  name_key: string;
  display_name: string | null;
  symbol: string | null;
  is_active: number;
  sort_order: number;
  has_transactions?: number;
}

interface DenominationRecord {
  id: number;
  currency_code: string;
  value: string;
  sort_order: number;
  is_active: number;
  in_use?: number;
}

export class TellerCurrencyRepository {
  constructor(private readonly db: Database.Database) {}

  listActive(): Currency[] {
    return this.list(true);
  }

  listAll(): Currency[] {
    return this.list(false);
  }

  private list(activeOnly: boolean): Currency[] {
    const where = activeOnly ? 'WHERE is_active = 1' : '';
    const rows = this.db
      .prepare(
        `SELECT code, name_key, display_name, symbol, is_active, sort_order,
                (${usageExistsSql()}) AS has_transactions
         FROM teller_currencies
         ${where}
         ORDER BY sort_order ASC, code ASC`,
      )
      .all() as CurrencyRecord[];

    return rows.map(toCurrency);
  }

  getByCode(code: string): Currency | undefined {
    const row = this.db
      .prepare(
        `SELECT code, name_key, display_name, symbol, is_active, sort_order,
                (${usageExistsSql()}) AS has_transactions
         FROM teller_currencies
         WHERE code = ?`,
      )
      .get(code) as CurrencyRecord | undefined;

    return row ? toCurrency(row) : undefined;
  }

  countActive(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM teller_currencies WHERE is_active = 1').get() as {
      count: number;
    };
    return row.count;
  }

  hasTransactions(code: string): boolean {
    const tellerRow = this.db
      .prepare('SELECT 1 AS present FROM teller_sessions WHERE currency_code = ? LIMIT 1')
      .get(code) as { present: number } | undefined;
    return tellerRow !== undefined;
  }

  nextSortOrder(): number {
    const row = this.db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM teller_currencies').get() as {
      max_sort: number;
    };
    return row.max_sort + 1;
  }

  create(input: { code: string; nameKey: string; displayName: string; symbol: string; sortOrder: number }): void {
    this.db
      .prepare(
        `INSERT INTO teller_currencies (code, name_key, display_name, symbol, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
      )
      .run(input.code, input.nameKey, input.displayName, input.symbol, input.sortOrder);
  }

  reactivate(code: string, symbol: string, displayName?: string): void {
    if (displayName !== undefined) {
      this.db
        .prepare(
          `UPDATE teller_currencies
           SET is_active = 1,
               symbol = ?,
               display_name = ?
           WHERE code = ?`,
        )
        .run(symbol, displayName, code);
      return;
    }
    this.db
      .prepare(
        `UPDATE teller_currencies
         SET is_active = 1,
             symbol = ?
         WHERE code = ?`,
      )
      .run(symbol, code);
  }

  deactivate(code: string): boolean {
    const result = this.db.prepare('UPDATE teller_currencies SET is_active = 0 WHERE code = ? AND is_active = 1').run(code);
    return result.changes > 0;
  }

  deleteByCode(code: string): boolean {
    this.db
      .prepare(
        `DELETE FROM teller_session_ht_denominations
         WHERE denomination_id IN (SELECT id FROM denominations WHERE currency_code = ?)`,
      )
      .run(code);
    this.db.prepare('DELETE FROM denominations WHERE currency_code = ?').run(code);
    const result = this.db.prepare('DELETE FROM teller_currencies WHERE code = ?').run(code);
    return result.changes > 0;
  }

  listDenominations(currencyCode: string, includeInactive = false): CurrencyDenomination[] {
    const whereInactive = includeInactive ? '' : 'AND d.is_active = 1';
    const rows = this.db
      .prepare(
        `SELECT d.id, d.currency_code, d.value, d.sort_order, d.is_active,
                (${denominationInUseSql()}) AS in_use
         FROM denominations d
         WHERE d.currency_code = ? ${whereInactive}
         ORDER BY d.sort_order ASC, d.id ASC`,
      )
      .all(currencyCode) as DenominationRecord[];
    return rows.map(toDenomination);
  }

  getDenomination(id: number): CurrencyDenomination | undefined {
    const row = this.db
      .prepare(
        `SELECT d.id, d.currency_code, d.value, d.sort_order, d.is_active,
                (${denominationInUseSql()}) AS in_use
         FROM denominations d
         WHERE d.id = ?`,
      )
      .get(id) as DenominationRecord | undefined;
    return row ? toDenomination(row) : undefined;
  }

  nextDenominationSortOrder(currencyCode: string): number {
    const row = this.db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM denominations WHERE currency_code = ?')
      .get(currencyCode) as { max_sort: number };
    return row.max_sort + 1;
  }

  createDenomination(input: { currencyCode: string; value: string; sortOrder: number }): number {
    const result = this.db
      .prepare(
        `INSERT INTO denominations (currency_code, value, sort_order, is_active)
         VALUES (?, ?, ?, 1)`,
      )
      .run(input.currencyCode, input.value, input.sortOrder);
    return Number(result.lastInsertRowid);
  }

  reactivateDenomination(id: number): void {
    this.db.prepare('UPDATE denominations SET is_active = 1 WHERE id = ?').run(id);
  }

  deactivateDenomination(id: number): boolean {
    const result = this.db.prepare('UPDATE denominations SET is_active = 0 WHERE id = ? AND is_active = 1').run(id);
    return result.changes > 0;
  }

  deleteDenomination(id: number): boolean {
    this.db.prepare('DELETE FROM teller_session_ht_denominations WHERE denomination_id = ? AND quantity = 0').run(id);
    this.db
      .prepare('DELETE FROM teller_transaction_denominations WHERE denomination_id = ? AND quantity = 0')
      .run(id);
    const result = this.db.prepare('DELETE FROM denominations WHERE id = ?').run(id);
    return result.changes > 0;
  }

  denominationInUse(id: number): boolean {
    const row = this.db
      .prepare(
        `SELECT 1 AS present
         FROM denominations d
         WHERE d.id = ? AND (${denominationInUseSql()}) = 1`,
      )
      .get(id) as { present: number } | undefined;
    return row !== undefined;
  }
}

function usageExistsSql(): string {
  return `EXISTS(SELECT 1 FROM teller_sessions ts WHERE ts.currency_code = teller_currencies.code)`;
}

function denominationInUseSql(): string {
  return `EXISTS(SELECT 1 FROM teller_transaction_denominations td WHERE td.denomination_id = d.id AND td.quantity > 0)
          OR EXISTS(SELECT 1 FROM teller_session_ht_denominations h WHERE h.denomination_id = d.id AND h.quantity > 0)`;
}

function toCurrency(row: CurrencyRecord): Currency {
  return {
    code: row.code,
    nameKey: row.name_key,
    displayName: (row.display_name ?? '').trim() || row.code,
    symbol: row.symbol ?? '',
    isActive: row.is_active === 1,
    sortOrder: row.sort_order,
    hasTransactions: row.has_transactions === 1,
  };
}

function toDenomination(row: DenominationRecord): CurrencyDenomination {
  return {
    id: row.id,
    currencyCode: row.currency_code,
    value: row.value,
    sortOrder: row.sort_order,
    isActive: row.is_active === 1,
    inUse: row.in_use === 1,
  };
}
