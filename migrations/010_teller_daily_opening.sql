-- 010_teller_daily_opening.sql
-- Daily Teller sheets: one session per currency per business date,
-- an opening cash position (OP) distinct from Opp-Amount,
-- and a unique date key so yesterday is never overwritten.

ALTER TABLE teller_sessions ADD COLUMN opening_amount TEXT NOT NULL DEFAULT '0.0000';
ALTER TABLE teller_sessions ADD COLUMN opp_amount TEXT NOT NULL DEFAULT '0.0000';

CREATE UNIQUE INDEX IF NOT EXISTS idx_teller_sessions_one_per_currency_date
  ON teller_sessions(company_id, currency_code, session_date);
