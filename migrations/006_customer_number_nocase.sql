-- 006_customer_number_nocase.sql
-- Support exact customer-number lookup used by search shortcuts at scale.

CREATE INDEX IF NOT EXISTS idx_customers_number_nocase
  ON customers(customer_number COLLATE NOCASE);

UPDATE app_metadata SET value = '6' WHERE key = 'schema_version';
