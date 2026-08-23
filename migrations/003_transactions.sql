-- 003_transactions.sql
-- Currencies registry and customer transactions (Phase 4).
-- Balances are computed on read; they are not stored on customers.

CREATE TABLE IF NOT EXISTS currencies (
  code        TEXT PRIMARY KEY,
  name_key    TEXT NOT NULL,
  symbol      TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO currencies (code, name_key, symbol, sort_order) VALUES
  ('AFN', 'currency.afn', '؋', 1),
  ('USD', 'currency.usd', '$', 2),
  ('EUR', 'currency.eur', '€', 3);

CREATE TABLE IF NOT EXISTS transactions (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id        INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type               TEXT NOT NULL CHECK (type IN ('CASH_IN', 'CASH_OUT')),
  currency_code      TEXT NOT NULL REFERENCES currencies(code),
  amount             TEXT NOT NULL,
  note               TEXT,
  transaction_date   TEXT NOT NULL DEFAULT (datetime('now')),
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_currency ON transactions(currency_code);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);

INSERT OR IGNORE INTO settings (key, value) VALUES ('pagination_enabled', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('pagination_page_size', '10');

UPDATE app_metadata SET value = '3' WHERE key = 'schema_version';
