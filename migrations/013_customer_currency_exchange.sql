-- Customer Accounting currency exchange metadata. Teller registries and data are untouched.
ALTER TABLE transactions ADD COLUMN exchange_id TEXT;
ALTER TABLE transactions ADD COLUMN exchange_role TEXT CHECK (exchange_role IN ('SOLD', 'BOUGHT'));
ALTER TABLE transactions ADD COLUMN exchange_from_currency TEXT REFERENCES currencies(code);
ALTER TABLE transactions ADD COLUMN exchange_from_amount TEXT;
ALTER TABLE transactions ADD COLUMN exchange_to_currency TEXT REFERENCES currencies(code);
ALTER TABLE transactions ADD COLUMN exchange_to_amount TEXT;
ALTER TABLE transactions ADD COLUMN exchange_rate TEXT;
ALTER TABLE transactions ADD COLUMN exchange_commission_currency TEXT REFERENCES currencies(code);
ALTER TABLE transactions ADD COLUMN exchange_commission_amount TEXT;
ALTER TABLE transactions ADD COLUMN exchange_request_id TEXT;

CREATE INDEX idx_transactions_exchange ON transactions(exchange_id);
CREATE UNIQUE INDEX idx_transactions_exchange_role ON transactions(exchange_id, exchange_role)
  WHERE exchange_id IS NOT NULL;
CREATE UNIQUE INDEX idx_transactions_exchange_request_role ON transactions(exchange_request_id, exchange_role)
  WHERE exchange_request_id IS NOT NULL;

UPDATE app_metadata SET value = '13' WHERE key = 'schema_version';
