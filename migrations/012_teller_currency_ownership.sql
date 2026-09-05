-- Separate Teller configuration. Copy rows before rebuilding foreign keys; the runner applies this atomically.
CREATE TABLE teller_currencies (code TEXT PRIMARY KEY, name_key TEXT NOT NULL, symbol TEXT, is_active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), display_name TEXT);
INSERT INTO teller_currencies SELECT code, name_key, symbol, is_active, sort_order, created_at, display_name FROM currencies;
CREATE TEMP TABLE preserved_denominations AS SELECT * FROM denominations;
CREATE TEMP TABLE preserved_teller_sessions AS SELECT * FROM teller_sessions;
CREATE TEMP TABLE preserved_teller_session_ht_denominations AS SELECT * FROM teller_session_ht_denominations;
CREATE TEMP TABLE preserved_teller_transactions AS SELECT * FROM teller_transactions;
CREATE TEMP TABLE preserved_teller_transaction_denominations AS SELECT * FROM teller_transaction_denominations;
DROP TABLE teller_transaction_denominations;
DROP TABLE teller_transactions;
DROP TABLE teller_session_ht_denominations;
DROP TABLE teller_sessions;
DROP TABLE denominations;
CREATE TABLE IF NOT EXISTS denominations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  currency_code   TEXT NOT NULL REFERENCES teller_currencies(code),
  value           TEXT NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (currency_code, value)
);

CREATE INDEX IF NOT EXISTS idx_denominations_currency
  ON denominations(currency_code, sort_order, id);

CREATE TABLE IF NOT EXISTS teller_sessions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id      INTEGER NOT NULL DEFAULT 1,
  teller_user_id  INTEGER NOT NULL REFERENCES admin_users(id),
  currency_code   TEXT NOT NULL REFERENCES teller_currencies(code),
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
  updated_by      INTEGER REFERENCES admin_users(id),
  opening_amount TEXT NOT NULL DEFAULT '0.0000',
  opp_amount TEXT NOT NULL DEFAULT '0.0000'
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
  worksheet_row INTEGER,
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

INSERT INTO denominations SELECT * FROM preserved_denominations;
DROP TABLE preserved_denominations;
INSERT INTO teller_sessions SELECT * FROM preserved_teller_sessions;
DROP TABLE preserved_teller_sessions;
INSERT INTO teller_session_ht_denominations SELECT * FROM preserved_teller_session_ht_denominations;
DROP TABLE preserved_teller_session_ht_denominations;
INSERT INTO teller_transactions (id,company_id,session_id,direction,reference_label,declared_amount,created_at,created_by,updated_at,updated_by,worksheet_row) SELECT id,company_id,session_id,direction,reference_label,declared_amount,created_at,created_by,updated_at,updated_by,worksheet_row FROM preserved_teller_transactions;
DROP TABLE preserved_teller_transactions;
INSERT INTO teller_transaction_denominations SELECT * FROM preserved_teller_transaction_denominations;
DROP TABLE preserved_teller_transaction_denominations;
CREATE UNIQUE INDEX idx_teller_sessions_one_per_currency_date ON teller_sessions(company_id,currency_code,session_date);
CREATE UNIQUE INDEX idx_teller_tx_session_direction_worksheet_row ON teller_transactions(session_id,direction,worksheet_row) WHERE worksheet_row IS NOT NULL;
UPDATE app_metadata SET value = '12' WHERE key = 'schema_version';
