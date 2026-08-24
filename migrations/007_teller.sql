-- 007_teller.sql
-- Teller / cash management module. Does not alter customer accounting tables.

CREATE TABLE IF NOT EXISTS denominations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  currency_code   TEXT NOT NULL REFERENCES currencies(code),
  value           TEXT NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (currency_code, value)
);

CREATE INDEX IF NOT EXISTS idx_denominations_currency
  ON denominations(currency_code, sort_order, id);

CREATE TABLE IF NOT EXISTS teller_transaction_types (
  code        TEXT PRIMARY KEY,
  name_key    TEXT NOT NULL,
  direction   TEXT NOT NULL CHECK (direction IN ('IN', 'OUT', 'OPENING')),
  party_kind  TEXT NOT NULL CHECK (party_kind IN ('CUSTOMER', 'HEAD_TELLER', 'INTERNAL', 'OPENING', 'ADJUSTMENT')),
  sort_order  INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO teller_transaction_types (code, name_key, direction, party_kind, sort_order) VALUES
  ('CUSTOMER_CASH_IN', 'teller.type.customerCashIn', 'IN', 'CUSTOMER', 1),
  ('CUSTOMER_CASH_OUT', 'teller.type.customerCashOut', 'OUT', 'CUSTOMER', 2),
  ('HEAD_TELLER_IN', 'teller.type.headTellerIn', 'IN', 'HEAD_TELLER', 3),
  ('HEAD_TELLER_OUT', 'teller.type.headTellerOut', 'OUT', 'HEAD_TELLER', 4),
  ('INTERNAL_TRANSFER_IN', 'teller.type.internalTransferIn', 'IN', 'INTERNAL', 5),
  ('INTERNAL_TRANSFER_OUT', 'teller.type.internalTransferOut', 'OUT', 'INTERNAL', 6),
  ('OPENING_BALANCE', 'teller.type.openingBalance', 'OPENING', 'OPENING', 7),
  ('ADJUSTMENT_IN', 'teller.type.adjustmentIn', 'IN', 'ADJUSTMENT', 8),
  ('ADJUSTMENT_OUT', 'teller.type.adjustmentOut', 'OUT', 'ADJUSTMENT', 9);

INSERT OR IGNORE INTO denominations (currency_code, value, sort_order) VALUES
  ('AFN', '1000', 1),
  ('AFN', '500', 2),
  ('AFN', '100', 3),
  ('AFN', '50', 4),
  ('AFN', '20', 5),
  ('AFN', '10', 6),
  ('AFN', '5', 7),
  ('AFN', '2', 8),
  ('AFN', '1', 9),
  ('USD', '100', 1),
  ('USD', '50', 2),
  ('USD', '20', 3),
  ('USD', '10', 4),
  ('USD', '5', 5),
  ('USD', '1', 6);

CREATE TABLE IF NOT EXISTS teller_sessions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id      INTEGER NOT NULL DEFAULT 1,
  teller_user_id  INTEGER NOT NULL REFERENCES admin_users(id),
  opened_at       TEXT NOT NULL,
  closed_at       TEXT,
  status          TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
  note            TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  created_by      INTEGER NOT NULL REFERENCES admin_users(id),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by      INTEGER REFERENCES admin_users(id)
);

CREATE INDEX IF NOT EXISTS idx_teller_sessions_company_status
  ON teller_sessions(company_id, status, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_teller_sessions_teller
  ON teller_sessions(company_id, teller_user_id, opened_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_teller_sessions_one_open
  ON teller_sessions(company_id)
  WHERE status = 'OPEN';

CREATE TABLE IF NOT EXISTS teller_session_opening_denominations (
  session_id      INTEGER NOT NULL REFERENCES teller_sessions(id) ON DELETE CASCADE,
  company_id      INTEGER NOT NULL DEFAULT 1,
  denomination_id INTEGER NOT NULL REFERENCES denominations(id),
  quantity        INTEGER NOT NULL CHECK (quantity >= 0),
  unit_value      TEXT NOT NULL,
  line_total      TEXT NOT NULL,
  PRIMARY KEY (session_id, denomination_id)
);

CREATE INDEX IF NOT EXISTS idx_teller_opening_company
  ON teller_session_opening_denominations(company_id, session_id);

CREATE TABLE IF NOT EXISTS teller_transactions (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id           INTEGER NOT NULL DEFAULT 1,
  session_id           INTEGER NOT NULL REFERENCES teller_sessions(id),
  teller_user_id       INTEGER NOT NULL REFERENCES admin_users(id),
  transaction_number   TEXT NOT NULL,
  type_code            TEXT NOT NULL REFERENCES teller_transaction_types(code),
  currency_code        TEXT NOT NULL REFERENCES currencies(code),
  customer_id          INTEGER REFERENCES customers(id),
  amount               TEXT NOT NULL,
  denomination_total   TEXT NOT NULL,
  running_balance      TEXT NOT NULL,
  validation_status    TEXT NOT NULL CHECK (validation_status IN ('OK')) DEFAULT 'OK',
  note                 TEXT,
  transaction_date     TEXT NOT NULL,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  created_by           INTEGER NOT NULL REFERENCES admin_users(id),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by           INTEGER REFERENCES admin_users(id),
  UNIQUE (company_id, transaction_number)
);

CREATE INDEX IF NOT EXISTS idx_teller_tx_company_date
  ON teller_transactions(company_id, transaction_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_teller_tx_session_date
  ON teller_transactions(company_id, session_id, transaction_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_teller_tx_company_type
  ON teller_transactions(company_id, type_code, transaction_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_teller_tx_company_currency
  ON teller_transactions(company_id, currency_code, transaction_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_teller_tx_company_customer
  ON teller_transactions(company_id, customer_id, transaction_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_teller_tx_teller
  ON teller_transactions(company_id, teller_user_id, transaction_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_teller_tx_number
  ON teller_transactions(company_id, transaction_number);

CREATE INDEX IF NOT EXISTS idx_teller_tx_created
  ON teller_transactions(company_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_teller_tx_session_currency_date
  ON teller_transactions(session_id, currency_code, transaction_date ASC, id ASC);

CREATE TABLE IF NOT EXISTS teller_transaction_denominations (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id       INTEGER NOT NULL DEFAULT 1,
  transaction_id   INTEGER NOT NULL REFERENCES teller_transactions(id) ON DELETE CASCADE,
  denomination_id  INTEGER NOT NULL REFERENCES denominations(id),
  quantity         INTEGER NOT NULL CHECK (quantity >= 0),
  unit_value       TEXT NOT NULL,
  line_total       TEXT NOT NULL,
  UNIQUE (transaction_id, denomination_id)
);

CREATE INDEX IF NOT EXISTS idx_teller_tx_denoms_tx
  ON teller_transaction_denominations(transaction_id);

CREATE INDEX IF NOT EXISTS idx_teller_tx_denoms_company_denom
  ON teller_transaction_denominations(company_id, denomination_id);

CREATE TABLE IF NOT EXISTS teller_cash_positions (
  company_id       INTEGER NOT NULL DEFAULT 1,
  denomination_id  INTEGER NOT NULL REFERENCES denominations(id),
  quantity         INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (company_id, denomination_id)
);

CREATE INDEX IF NOT EXISTS idx_teller_positions_company
  ON teller_cash_positions(company_id);

CREATE TABLE IF NOT EXISTS teller_session_currency_totals (
  session_id       INTEGER NOT NULL REFERENCES teller_sessions(id) ON DELETE CASCADE,
  company_id       INTEGER NOT NULL DEFAULT 1,
  currency_code    TEXT NOT NULL REFERENCES currencies(code),
  cash_in_amount   TEXT NOT NULL DEFAULT '0.0000',
  cash_out_amount  TEXT NOT NULL DEFAULT '0.0000',
  cash_in_count    INTEGER NOT NULL DEFAULT 0,
  cash_out_count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, currency_code)
);

UPDATE app_metadata SET value = '7' WHERE key = 'schema_version';
