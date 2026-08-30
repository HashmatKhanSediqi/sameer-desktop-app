-- 009_teller_workbook_model.sql
-- Rebuild Teller / Cash Management to match the Excel workbook model.
-- Drops the incorrect customer-accounting coupling (customer_id FK) and
-- the constrained transaction-type enum. Customer Accounting tables are not altered.

DROP TABLE IF EXISTS teller_transaction_denominations;
DROP TABLE IF EXISTS teller_session_opening_denominations;
DROP TABLE IF EXISTS teller_session_currency_totals;
DROP TABLE IF EXISTS teller_cash_positions;
DROP TABLE IF EXISTS teller_transactions;
DROP TABLE IF EXISTS teller_sessions;
DROP TABLE IF EXISTS teller_transaction_types;

CREATE TABLE IF NOT EXISTS teller_sessions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id      INTEGER NOT NULL DEFAULT 1,
  teller_user_id  INTEGER NOT NULL REFERENCES admin_users(id),
  currency_code   TEXT NOT NULL REFERENCES currencies(code),
  session_date    TEXT NOT NULL,
  branch_name     TEXT,
  branch_code     TEXT,
  cash_in_icba    TEXT NOT NULL DEFAULT '0.0000',
  cash_out_icba   TEXT NOT NULL DEFAULT '0.0000',
  status          TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
  note            TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at       TEXT,
  created_by      INTEGER NOT NULL REFERENCES admin_users(id),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by      INTEGER REFERENCES admin_users(id)
);

CREATE INDEX IF NOT EXISTS idx_teller_sessions_company_currency
  ON teller_sessions(company_id, currency_code, session_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_teller_sessions_teller
  ON teller_sessions(company_id, teller_user_id, session_date DESC, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_teller_sessions_one_open_per_currency
  ON teller_sessions(company_id, currency_code)
  WHERE status = 'OPEN';

CREATE TABLE IF NOT EXISTS teller_session_ht_denominations (
  session_id      INTEGER NOT NULL REFERENCES teller_sessions(id) ON DELETE CASCADE,
  company_id      INTEGER NOT NULL DEFAULT 1,
  denomination_id INTEGER NOT NULL REFERENCES denominations(id),
  quantity        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, denomination_id)
);

CREATE INDEX IF NOT EXISTS idx_teller_ht_denoms_session
  ON teller_session_ht_denominations(session_id);

CREATE TABLE IF NOT EXISTS teller_transactions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id       INTEGER NOT NULL DEFAULT 1,
  session_id       INTEGER NOT NULL REFERENCES teller_sessions(id) ON DELETE CASCADE,
  direction        TEXT NOT NULL CHECK (direction IN ('DEPOSIT', 'WITHDRAWAL')),
  reference_label  TEXT NOT NULL DEFAULT '',
  declared_amount  TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  created_by       INTEGER NOT NULL REFERENCES admin_users(id),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by       INTEGER REFERENCES admin_users(id)
);

CREATE INDEX IF NOT EXISTS idx_teller_tx_session_direction
  ON teller_transactions(session_id, direction, id ASC);

CREATE INDEX IF NOT EXISTS idx_teller_tx_company_created
  ON teller_transactions(company_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS teller_transaction_denominations (
  transaction_id   INTEGER NOT NULL REFERENCES teller_transactions(id) ON DELETE CASCADE,
  company_id       INTEGER NOT NULL DEFAULT 1,
  denomination_id  INTEGER NOT NULL REFERENCES denominations(id),
  quantity         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (transaction_id, denomination_id)
);

CREATE INDEX IF NOT EXISTS idx_teller_tx_denoms_tx
  ON teller_transaction_denominations(transaction_id);

UPDATE app_metadata SET value = '9' WHERE key = 'schema_version';
