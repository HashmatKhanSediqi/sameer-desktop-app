import type Database from 'better-sqlite3';
import type { Currency } from '@shared/types/currency';

interface CurrencyRecord {
  code: string;
  name_key: string;
  symbol: string | null;
  is_active: number;
  sort_order: number;
}

export class CurrencyRepository {
  constructor(private readonly db: Database.Database) {}

  listActive(): Currency[] {
    const rows = this.db
      .prepare(
        `SELECT code, name_key, symbol, is_active, sort_order
         FROM currencies
         WHERE is_active = 1
         ORDER BY sort_order ASC, code ASC`,
      )
      .all() as CurrencyRecord[];

    return rows.map(toCurrency);
  }

  listAll(): Currency[] {
    const rows = this.db
      .prepare(
        `SELECT code, name_key, symbol, is_active, sort_order
         FROM currencies
         ORDER BY sort_order ASC, code ASC`,
      )
      .all() as CurrencyRecord[];

    return rows.map(toCurrency);
  }

  getByCode(code: string): Currency | undefined {
    const row = this.db
      .prepare(
        `SELECT code, name_key, symbol, is_active, sort_order
         FROM currencies
         WHERE code = ?`,
      )
      .get(code) as CurrencyRecord | undefined;

    return row ? toCurrency(row) : undefined;
  }

  countActive(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM currencies WHERE is_active = 1').get() as {
      count: number;
    };
    return row.count;
  }

  hasTransactions(code: string): boolean {
    const row = this.db
      .prepare('SELECT 1 AS present FROM transactions WHERE currency_code = ? LIMIT 1')
      .get(code) as { present: number } | undefined;
    return row !== undefined;
  }

  nextSortOrder(): number {
    const row = this.db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM currencies').get() as {
      max_sort: number;
    };
    return row.max_sort + 1;
  }

  create(input: { code: string; nameKey: string; symbol: string; sortOrder: number }): void {
    this.db
      .prepare(
        `INSERT INTO currencies (code, name_key, symbol, sort_order, is_active)
         VALUES (?, ?, ?, ?, 1)`,
      )
      .run(input.code, input.nameKey, input.symbol, input.sortOrder);
  }

  reactivate(code: string, symbol: string): void {
    this.db
      .prepare(
        `UPDATE currencies
         SET is_active = 1,
             symbol = ?
         WHERE code = ?`,
      )
      .run(symbol, code);
  }

  deactivate(code: string): boolean {
    const result = this.db.prepare('UPDATE currencies SET is_active = 0 WHERE code = ? AND is_active = 1').run(code);
    return result.changes > 0;
  }
}

function toCurrency(row: CurrencyRecord): Currency {
  return {
    code: row.code,
    nameKey: row.name_key,
    symbol: row.symbol ?? '',
    isActive: row.is_active === 1,
    sortOrder: row.sort_order,
  };
}
