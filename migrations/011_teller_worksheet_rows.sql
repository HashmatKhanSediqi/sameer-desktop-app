-- 011_teller_worksheet_rows.sql
-- Preserve the operator-selected spreadsheet row for each Teller transaction.

ALTER TABLE teller_transactions ADD COLUMN worksheet_row INTEGER;

UPDATE teller_transactions AS current
SET worksheet_row = (
  SELECT COUNT(*)
  FROM teller_transactions AS earlier
  WHERE earlier.session_id = current.session_id
    AND earlier.direction = current.direction
    AND earlier.id <= current.id
) + CASE WHEN current.direction = 'DEPOSIT' THEN 1 ELSE 0 END;

CREATE UNIQUE INDEX IF NOT EXISTS idx_teller_tx_session_direction_worksheet_row
  ON teller_transactions(session_id, direction, worksheet_row)
  WHERE worksheet_row IS NOT NULL;

UPDATE app_metadata SET value = '11' WHERE key = 'schema_version';
