-- 005_query_indexes.sql
-- Composite indexes for customer history and list ordering at scale.

CREATE INDEX IF NOT EXISTS idx_transactions_customer_date
  ON transactions(customer_id, transaction_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_customers_created_at
  ON customers(created_at DESC, id DESC);

UPDATE app_metadata SET value = '5' WHERE key = 'schema_version';
