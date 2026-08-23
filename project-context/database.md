# Database Design

SQLite schema, migration strategy, and data integrity rules for **FMT**.

---

## 1. Overview

| Attribute | Value |
|-----------|-------|
| Engine | SQLite 3 via `better-sqlite3` |
| Access | Main process only |
| File location | `%APPDATA%\CustomerAccounting\data\accounting.db` |
| WAL mode | Enabled |
| Foreign keys | `PRAGMA foreign_keys = ON` |
| Busy timeout | `5000` ms |
| Synchronous | `NORMAL` |
| Startup integrity | `PRAGMA integrity_check` — fail closed with `DATABASE_CORRUPTED` |
| Encoding | UTF-8 |

The `CustomerAccounting` folder name is an intentional compatibility path (not user-facing branding).

---

## 2. Monetary Amount Storage

**Canonical:** store amounts as **TEXT** decimal strings (up to 4 decimal places).

- Validate on write with `decimal.js`
- **Never** use raw JavaScript floating-point for business calculations
- Balance aggregation SQL currently may use `CAST(amount AS REAL)` — known theoretical precision limitation at extreme values; see `release-readiness.md`

---

## 3. Schema (Current)

Migrations applied in order:

| Version | File | Purpose |
|---------|------|---------|
| 1 | `001_initial.sql` | Admin, settings, metadata scaffolding |
| 2 | `002_customers.sql` | Customers + photo filename |
| 3 | `003_transactions.sql` | Currencies + transactions |
| 4 | `004_admin_company_theme_transfers.sql` | Recovery columns, company profile, transfer columns, theme/exchange settings |
| 5 | `005_query_indexes.sql` | Scale indexes for list/search/aggregations |

### Core tables

- `schema_migrations`, `app_metadata`, `admin_users`
- `currencies`, `customers`, `transactions`
- `company_profile`, `settings`

### Transactions

- Types: `CASH_IN`, `CASH_OUT`
- Amount: TEXT decimal
- Optional transfer linkage: `transfer_id`, `transfer_role`, `counterparty_customer_id`
- `ON DELETE CASCADE` from customers

### Settings (selected defaults)

| Key | Default | Notes |
|-----|---------|-------|
| `language` | `en` | `en`, `fa-AF`, `ps` |
| `pagination_enabled` | `true` | Transaction history |
| `pagination_page_size` | `10` | Configurable |
| `exchange_enabled` | `false` | Main-page calculator |
| Theme / card tone keys | seeded | CSS variables |

---

## 4. Balance Calculation

Balances are **computed on read** (not denormalized balance columns).

Per customer / currency: Cash In − Cash Out.  
Currencies with no rows display `0` in the application layer.

Global totals: SQL aggregation across customers (paginated list does **not** load all customers into renderer memory).

---

## 5. Migration Strategy

1. Numbered SQL files in `/migrations`
2. Each migration runs inside a SQLite transaction
3. Version row inserted **only** after successful execution
4. Failed migration must not appear completed; app must not continue on a half-applied schema
5. Indexes use `IF NOT EXISTS` where appropriate for safe re-open

---

## 6. Transaction Integrity

| Operation | Boundary |
|-----------|----------|
| Create / update / delete single transaction | Single statement (SQLite atomic) |
| Transfer | One transaction: balance check + both legs |
| Import commit | One SQLite transaction for all accepted rows |
| Delete customer | Cascade in FK / atomic delete |
| Restore | Safety backup → validate → atomic file replace → reopen |

Transfer insufficient-balance checks run **inside** the DB transaction (prevents TOCTOU partial pairs).

Cash-out / edit do **not** currently enforce a non-negative balance gate (known product behavior / limitation).

---

## 7. Indexing & Scale

Migration `005_query_indexes.sql` supports large customer/transaction sets.

Empirically validated:

- 100,000 customers
- 300,000 transactions

**1,000,000+ customers have not been empirically validated.**

FTS5 full-text search is **not** implemented; search uses SQL `LIKE`.

---

## 8. Crash / Corruption Handling

| Event | Behavior |
|-------|----------|
| Crash mid-transaction | WAL rollback on next open |
| Unclean shutdown | Crash sentinel warns; integrity still runs |
| Corruption detected | Fail open attempt; **do not** overwrite DB |
| Recovery | Restore from backup (pre-login restore supported) |

---

## 9. What NOT to Store

- Plaintext passwords or recovery answers
- Session tokens in SQLite (memory only)
- Audit log (out of scope)
- Mixed-currency totals as a single number
