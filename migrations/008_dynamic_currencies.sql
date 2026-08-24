-- 008_dynamic_currencies.sql
-- Display names, EUR denomination seed, and safe currency deletion support.
-- Does not alter existing AFN/USD teller data.

ALTER TABLE currencies ADD COLUMN display_name TEXT;

UPDATE currencies SET display_name = 'Afghan Afghani' WHERE code = 'AFN' AND (display_name IS NULL OR display_name = '');
UPDATE currencies SET display_name = 'US Dollar' WHERE code = 'USD' AND (display_name IS NULL OR display_name = '');
UPDATE currencies SET display_name = 'Euro' WHERE code = 'EUR' AND (display_name IS NULL OR display_name = '');
UPDATE currencies SET display_name = code WHERE display_name IS NULL OR display_name = '';

INSERT OR IGNORE INTO denominations (currency_code, value, sort_order) VALUES
  ('EUR', '100', 1),
  ('EUR', '50', 2),
  ('EUR', '20', 3),
  ('EUR', '10', 4),
  ('EUR', '5', 5),
  ('EUR', '2', 6),
  ('EUR', '1', 7),
  ('EUR', '0.50', 8),
  ('EUR', '0.20', 9),
  ('EUR', '0.10', 10),
  ('EUR', '0.05', 11),
  ('EUR', '0.02', 12),
  ('EUR', '0.01', 13);

CREATE INDEX IF NOT EXISTS idx_denominations_currency_value
  ON denominations(currency_code, value);

UPDATE app_metadata SET value = '8' WHERE key = 'schema_version';
