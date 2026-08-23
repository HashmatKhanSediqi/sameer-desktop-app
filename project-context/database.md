# Database Design

SQLite schema, migration strategy, and data integrity rules for Customer Accounting.

---

## 1. Overview

| Attribute | Value |
|-----------|-------|
| Engine | SQLite 3 |
| Access | Main process only (via `better-sqlite3`) |
| File location | `%APPDATA%/CustomerAccounting/data/accounting.db` |
| WAL mode | Enabled for crash safety |
| Foreign keys | Enabled (`PRAGMA foreign_keys = ON`) |
| Encoding | UTF-8 |

---

## 2. Monetary Amount Storage

**Canonical choice: `TEXT` storing decimal string OR `INTEGER` minor units.**

**Recommended for v1.0: `REAL` avoided; use `NUMERIC` (SQLite affinity) stored as TEXT decimal strings.**

For implementation simplicity and accounting accuracy:

```sql
-- Store amounts as TEXT with up to 4 decimal places
-- Example: "1500.5000", "0.0000"
-- Validate on insert: regex / decimal library
```

Alternative acceptable: store as INTEGER in smallest currency unit (e.g., fils for AFN) if consistently applied. Document choice in code and never mix approaches.

**Rule: Never use JavaScript floating-point for monetary calculations in business logic.** Use a decimal library (`decimal.js` or `big.js`) in the main process.

---

## 3. Schema

### 3.1 `schema_migrations`

Tracks applied migrations.

```sql
CREATE TABLE schema_migrations (
  version     INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 3.2 `app_metadata`

Application-level metadata.

```sql
CREATE TABLE app_metadata (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Keys:
-- app_version          → "1.0.0"
-- schema_version       → "1"
-- installed_at         → ISO8601
-- last_backup_at       → ISO8601 or null
```

### 3.3 `admin_users`

Single admin account (extensible to multiple rows in future).

```sql
CREATE TABLE admin_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Seed on first run:**
- username: `admin`
- password_hash: bcrypt hash of `admin123` (cost factor ≥ 10)

### 3.4 `currencies`

Registry of supported currencies.

```sql
CREATE TABLE currencies (
  code        TEXT PRIMARY KEY,       -- 'AFN', 'USD', 'EUR'
  name_key    TEXT NOT NULL,          -- i18n key: 'currency.afn'
  symbol      TEXT,                   -- '؋', '$', '€'
  is_active   INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Seed:**
```sql
INSERT INTO currencies (code, name_key, symbol, sort_order) VALUES
  ('AFN', 'currency.afn', '؋', 1),
  ('USD', 'currency.usd', '$', 2),
  ('EUR', 'currency.eur', '€', 3);
```

### 3.5 `customers`

```sql
CREATE TABLE customers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT,               -- optional
  customer_number TEXT,               -- optional, indexed for search
  photo_filename  TEXT,               -- relative path in user data images dir
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT                -- null = active; soft delete optional (hard delete acceptable if documented)
);
```

**Note:** Hard delete is acceptable if all related transactions are deleted in same atomic transaction. Prefer hard delete with CASCADE for simplicity in v1.0.

```sql
CREATE INDEX idx_customers_number ON customers(customer_number);
CREATE INDEX idx_customers_name ON customers(name);
```

### 3.6 `transactions`

```sql
CREATE TABLE transactions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('CASH_IN', 'CASH_OUT')),
  currency_code TEXT NOT NULL REFERENCES currencies(code),
  amount        TEXT NOT NULL,        -- decimal string
  note          TEXT,                 -- unlimited (SQLite TEXT max ~1GB)
  transaction_date TEXT NOT NULL DEFAULT (datetime('now')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_transactions_customer ON transactions(customer_id);
CREATE INDEX idx_transactions_date ON transactions(transaction_date);
CREATE INDEX idx_transactions_currency ON transactions(currency_code);
CREATE INDEX idx_transactions_type ON transactions(type);
```

Migration `004_admin_company_theme_transfers.sql` adds transfer ledger columns (do not rewrite `003`):

| Column | Type | Notes |
|--------|------|-------|
| `transfer_id` | TEXT | Shared UUID for both legs of a transfer |
| `transfer_role` | TEXT | `OUT` (source Cash Out) or `IN` (destination Cash In) |
| `counterparty_customer_id` | INTEGER | Other customer in the transfer |

### 3.6a `company_profile`

Single-row company identity (`id = 1`). Logo bytes stay on disk under `data/images/company/`; the table stores `logo_filename` only.

### 3.6b Admin recovery columns

`admin_users.recovery_question` (plaintext question) and `admin_users.recovery_answer_hash` (bcrypt hash of the normalized answer).

### 3.7 `settings`

Key-value settings store.

```sql
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

**Default settings:**

| Key | Default Value | Description |
|-----|---------------|-------------|
| `language` | `en` | Active UI language: `en`, `fa-AF` (Dari), `ps` (Pashto) |
| `pagination_enabled` | `true` | Enable transaction list pagination |
| `pagination_page_size` | `10` | Rows per page when pagination enabled |
| `date_format` | `YYYY-MM-DD` | Display date format |
| `backup_reminder_days` | `7` | Optional reminder interval (future) |
| `exchange_enabled` | `false` | Show the main-page currency exchange calculator |
| `theme_primary` | `#1f7a4d` | Application primary color |
| `theme_accent` | `#258a58` | Application accent color |
| `card_tones` | JSON | Main-page summary card background/accent colors |

---

## 4. Balance Calculation

**Do NOT store denormalized balances** unless maintained by triggers. Preferred: **compute on read** for correctness.

### Per-customer, per-currency balance

```sql
SELECT
  currency_code,
  COALESCE(SUM(CASE WHEN type = 'CASH_IN'  THEN CAST(amount AS NUMERIC) ELSE 0 END), 0)
  - COALESCE(SUM(CASE WHEN type = 'CASH_OUT' THEN CAST(amount AS NUMERIC) ELSE 0 END), 0)
  AS balance
FROM transactions
WHERE customer_id = ?
GROUP BY currency_code;
```

Currencies with no transactions return balance `0` in application layer.

### Global totals (main page)

Sum balances across all customers per currency independently.

### Cash In / Cash Out counts

```sql
SELECT
  type,
  COUNT(*) as count
FROM transactions
WHERE customer_id = ?
GROUP BY type;
```

---

## 5. Migration Strategy

### Rules

1. Migrations are numbered sequentially: `001_initial.sql`, `002_add_setting.sql`, ...
2. Each migration runs in a transaction.
3. **Never drop columns with data** without migration path.
4. **Never destructive migration** without backup prompt in update flow.
5. Record each applied migration in `schema_migrations`.

### Migration Runner Pseudocode

```
currentVersion = MAX(schema_migrations.version) or 0
for each migration file where version > currentVersion:
  BEGIN TRANSACTION
  execute SQL
  INSERT INTO schema_migrations
  COMMIT
```

### Schema Change During App Update

See `update-system.md`. Summary:

1. App update preserves `accounting.db`
2. On startup after update, migration runner applies pending migrations
3. If migration fails, restore from auto-safety backup and abort

---

## 6. Transaction Integrity

| Operation | Transaction Boundary |
|-----------|---------------------|
| Create customer | Single INSERT |
| Delete customer | DELETE customer + CASCADE transactions (atomic) |
| Create transaction | Single INSERT |
| Delete transaction | Single DELETE |
| Import commit | Single SQLite transaction wrapping all valid rows |
| Restore backup | Replace DB file atomically after safety backup |
| Customer transfer | Single SQLite transaction: Cash Out source + Cash In destination |

---

## 7. Notes Field

- SQLite `TEXT` type — no practical small limit
- Application must NOT impose character limits below SQLite capacity
- UI should use multiline textarea with reasonable min-height
- Reports truncate display with ellipsis only in list views, not in detail/export

---

## 8. Indexing Strategy

Ensure indexes exist for:
- Customer list queries
- Transaction history by customer + date DESC
- Date-range report queries
- Currency summary aggregations

For large datasets (>100k transactions), consider covering indexes on `(customer_id, transaction_date DESC)`.

---

## 9. Backup-Relevant Tables

All tables above plus:
- Profile image files (filesystem, not DB)
- `app_metadata`
- `settings`

Must be included in backup manifest — see `backup-restore.md`.

---

## 10. What NOT to Store

- Plaintext passwords
- Session tokens in database (sessions in memory only for v1.0)
- Audit log entries (feature removed)
- Mixed-currency totals
