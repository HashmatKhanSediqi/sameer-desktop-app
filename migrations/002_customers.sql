-- 002_customers.sql
-- Customer records for Phase 3. Does not create transaction tables.
-- Customer number is optional and not unique (duplicates allowed per customers.md).

CREATE TABLE IF NOT EXISTS customers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT,
  customer_number TEXT,
  photo_filename  TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customers_number ON customers(customer_number);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

UPDATE app_metadata SET value = '2' WHERE key = 'schema_version';
