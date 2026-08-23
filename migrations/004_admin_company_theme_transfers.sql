-- 004_admin_company_theme_transfers.sql
-- Company profile, appearance, recovery hint, exchange toggle, and transfer ledger fields.

ALTER TABLE admin_users ADD COLUMN recovery_question TEXT;
ALTER TABLE admin_users ADD COLUMN recovery_answer_hash TEXT;

CREATE TABLE IF NOT EXISTS company_profile (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  name            TEXT,
  phone           TEXT,
  email           TEXT,
  address         TEXT,
  website         TEXT,
  notes           TEXT,
  logo_filename   TEXT,
  configured      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO company_profile (id, configured) VALUES (1, 0);

ALTER TABLE transactions ADD COLUMN transfer_id TEXT;
ALTER TABLE transactions ADD COLUMN transfer_role TEXT;
ALTER TABLE transactions ADD COLUMN counterparty_customer_id INTEGER REFERENCES customers(id);

CREATE INDEX IF NOT EXISTS idx_transactions_transfer ON transactions(transfer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_counterparty ON transactions(counterparty_customer_id);

INSERT OR IGNORE INTO settings (key, value) VALUES ('exchange_enabled', 'false');
INSERT OR IGNORE INTO settings (key, value) VALUES ('theme_primary', '#1f7a4d');
INSERT OR IGNORE INTO settings (key, value) VALUES ('theme_accent', '#258a58');
INSERT OR IGNORE INTO settings (key, value) VALUES (
  'card_tones',
  '{"1":{"background":"#e7f3ec","accent":"#2f6f4e"},"2":{"background":"#eaf2f8","accent":"#3b6b8c"},"3":{"background":"#f3eee8","accent":"#8a6a4a"}}'
);

UPDATE app_metadata SET value = '4' WHERE key = 'schema_version';
