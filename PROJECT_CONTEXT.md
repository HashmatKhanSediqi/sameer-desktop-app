# FMT — Project Context (Phase 3)

This file is the architectural reference for **Phase 3: Teller / Cash Management**. It was written after inspecting the current source, migrations, IPC layer, tests, and configuration. It describes what exists today and how the Teller module is added **inside** the existing application — not as a second product.

Official product name: **FMT**. Compatibility identifiers (`%APPDATA%\CustomerAccounting\`, `com.customeraccounting.app`, npm `customer-accounting`) remain unchanged.

---

## Current application architecture

FMT is a single-user, offline-first Windows desktop accounting application.

| Layer | Technology |
|-------|------------|
| Desktop shell | Electron 34 (`electron-vite`) |
| UI | React 18 + TypeScript (strict) |
| Database | SQLite via `better-sqlite3` (main process only) |
| Money | `decimal.js`; amounts stored as TEXT decimal strings (up to 4 places) |
| Auth | bcrypt + in-memory session store |
| i18n | i18next — English, Dari (`fa-AF`), Pashto (`ps`) |
| Reports | PDFKit + exceljs (main process) |
| Backup | `.cab` ZIP-compatible archive of the local database, images, and settings |
| Packaging | electron-builder NSIS → `FMT-Setup.exe` |

Process split:

```
Main (Node)  ── IPC / contextBridge ──►  Renderer (React, no Node)
  SQLite, bcrypt, files, reports
```

Renderer never imports `better-sqlite3` and never touches the filesystem. All protected IPC handlers validate the in-memory session first.

Existing modules: `auth`, `company`, `customers`, `transactions` (customer ledger), `currencies`, `reports`, `import`, `backup-restore`, `settings`, `update`.

Phase 3 adds a **teller** module alongside customer accounting. It does not replace the customer ledger.

---

## Frontend architecture

- Entry: `src/renderer/main.tsx` → `App` inside `AuthProvider` + i18n.
- Routing is **view-state**, not react-router. `App.tsx` chooses Login / Restore / Recovery / Company setup / authenticated shell.
- Authenticated customer-accounting UI lives in `src/renderer/pages/AppShell.tsx` (list, detail, settings, reports, import).
- Styling: custom CSS design system in `src/renderer/styles/global.css` (green brand tokens, Cash In green / Cash Out red).
- Shared types: `src/shared/types/*`. Preload API typed in `src/renderer/env.d.ts`.
- Localization namespaces: `common`, `auth`, `customers`, `transactions`, `reports`, `settings`, `import`, `backup`, `errors`. Phase 3 adds `teller`.

There is no client-side store for financial data. Lists are loaded through paginated IPC.

---

## Electron architecture

- Main entry: `src/main/index.ts`
- Window: contextIsolation on, nodeIntegration off, sandbox on, preload `src/preload/index.ts`
- User data path: `%APPDATA%\CustomerAccounting\` (compatibility; not user-facing branding)
- Database file: `%APPDATA%\CustomerAccounting\data\accounting.db`
- Single-instance lock; auto-close backup on quit; crash sentinel + `PRAGMA integrity_check`
- IPC allow-list: `IPC_CHANNELS` in `src/shared/types/ipc.ts`; preload rejects unknown channels

---

## Database architecture

| Attribute | Value |
|-----------|-------|
| Engine | SQLite 3, WAL, foreign keys ON |
| Access | Main process only |
| Migrations | Numbered SQL in `/migrations`, applied by `src/main/database/migrationRunner.ts` |
| Monetary amounts | TEXT decimal strings; business math uses `decimal.js` |
| Balances (customer module) | Computed on read; not denormalized on `customers` |

Repositories live in `src/main/database/repositories/`. Services orchestrate validation and transactions.

---

## Authentication architecture

- Single administrator (`admin_users`). Default seed: username `admin`, password `admin123` (bcrypt cost 10). **Do not change defaults.**
- Session: in-memory `SessionStore` (`id`, `userId`, `username`). Idle timeout 8 hours. Cleared on quit.
- Every protected handler calls `authService.requireSession(sessionId)`.
- Recovery: hashed security question/answer. Password change invalidates sessions.
- Pre-login restore is intentional (credentials come from the backup).

Teller **reuses this session**. No second login. `created_by` / teller identity come from `session.userId`, never from the renderer.

---

## Existing migrations

| Version | File | Purpose |
|---------|------|---------|
| 1 | `001_initial.sql` | `schema_migrations`, `app_metadata`, `admin_users`, `settings` |
| 2 | `002_customers.sql` | `customers` |
| 3 | `003_transactions.sql` | `currencies`, `transactions` (customer Cash In/Out) |
| 4 | `004_admin_company_theme_transfers.sql` | recovery columns, `company_profile`, transfer columns, theme/exchange settings |
| 5 | `005_query_indexes.sql` | composite list/history indexes |
| 6 | `006_customer_number_nocase.sql` | case-insensitive customer-number index |
| 7 | `007_teller.sql` | Teller tables, types, AFN/USD denominations (do not edit after apply) |
| 8 | `008_dynamic_currencies.sql` | `currencies.display_name`, EUR denomination seed, denomination value index |
| 9 | `009_teller_workbook_model.sql` | Teller workbook sessions, rows, opening/summary fields, and denomination snapshots |
| 10 | `010_teller_daily_opening.sql` | Global Teller business-day opening metadata |
| 11 | `011_teller_worksheet_rows.sql` | Stable per-session/per-direction worksheet row slots for free-form row entry |

**Existing files must not be edited.** Teller refinements are added as new numbered migrations (currently through `011_teller_worksheet_rows.sql`).

---

## Existing database tables

- `schema_migrations`, `app_metadata`
- `admin_users`
- `settings`
- `customers`
- `currencies` (seeded AFN, USD, EUR; Settings-extensible)
- `transactions` (customer ledger: `CASH_IN` / `CASH_OUT`, optional transfer linkage)
- `company_profile` (singleton `id = 1`)

There is **no multi-company table**. Company context is the singleton `company_profile`. Teller records still carry `company_id` (currently always `1`) so isolation is enforced in SQL and a second company cannot leak if rows with another `company_id` exist.

---

## Existing services / repositories

| Service | Repository / helpers |
|---------|----------------------|
| `AuthService` | `AdminRepository`, `SessionStore` |
| `CustomerService` | `CustomerRepository`, `CustomerPhotoService` |
| `TransactionService` | `TransactionRepository`, `CurrencyRepository`, `money.ts`, `transactionValidation.ts` |
| `CurrencyService` | `CurrencyRepository` |
| `CompanyService` | `CompanyRepository`, `CompanyLogoService` |
| `SettingsService` | settings table |
| `ReportsService` | PDF/Excel generators |
| `ImportService` | xlsx parse/commit |
| `BackupService` | full local archive (entire SQLite file — new Teller tables are included automatically) |
| `UpdateService` | GitHub Releases / electron-updater |

Phase 3 adds `TellerService` + `TellerRepository`. It does **not** write to `transactions` (customer ledger). Teller cash and customer-account cash are related in business terms (a customer deposit at the window) but are stored as separate ledgers so customer accounting remains unchanged.

---

## Existing IPC / API structure

Typed channels in `IPC_CHANNELS`. Pattern: `namespace:action`. Handlers in `src/main/ipc/*.handlers.ts`, registered by `registerIpcHandlers`. Preload exposes `window.api.*`.

Protected requests include `sessionId`. Responses are `{ ok: true, data } | { ok: false, errorCode, message? }`.

Phase 3 adds `teller:*` channels. Company ID, user ID, and computed amounts are **not** trusted from the renderer.

---

## Existing UI structure

```
Login → (optional Restore / Recovery)
     → Company setup if company_profile.configured = 0
     → AppShell (customer list as the main accounting surface)
```

Header: company logo/name, language, Import, Reports, Settings, Logout.

Phase 3 inserts a **module selection** screen after company context is ready, then either the existing `AppShell` or the new `TellerShell`. A persistent module switcher is shown in both shells.

---

## Existing testing setup

- Runner: Vitest (`npm test` → `vitest run`)
- `tests/unit/*`, `tests/integration/*`, helpers in `tests/helpers/`
- Temp SQLite via `createTestDatabase()` + `applyProjectMigrations()`
- Scale fixtures exist for customer accounting (100k / 300k)
- **No `lint` script** in `package.json`. Verification commands: `npm test`, `npm run typecheck`, `npm run build`
- Playwright E2E is not implemented

---

## Existing build / package setup

- `npm run dev` — electron-vite
- `npm run build` — electron-vite production output in `out/`
- `npm run build:win` — NSIS installer
- `npm run typecheck` — `tsc` for `tsconfig.node.json` and `tsconfig.web.json`
- Native rebuild: `pretest` / `predev` / `prebuild` scripts

---

## Existing Git configuration

- Remote: `https://github.com/HashmatKhanSediqi/sameer-desktop-app.git`
- Branch used for releases: `main`
- Ignore: `node_modules/`, `out/`, `dist/`, logs, Vite cache
- Do not commit databases, secrets, or machine-specific files
- Commit style: concise imperative messages (`feat:`, `fix:`)

---

## Existing authentication behavior

Login with `admin` / `admin123` on a fresh database. Failed login returns a generic invalid-credentials error. Session lives only in memory. Logout returns to the login screen without deleting data.

---

## Existing company registration behavior

`company_profile` is a singleton (`id = 1`). After first login, if `configured = 0`, `CompanySetupPage` requires a company name (logo and other fields optional). After save, the authenticated app loads. Company logo/name appear in the header and on reports.

---

## Existing customer accounting functionality

- Customer CRUD, photos, paginated list/search
- Customer Cash In / Cash Out on the **customer ledger** (`transactions` table)
- Customer-to-customer transfers (atomic pair, insufficient-balance gate)
- Per-currency balances computed on read (Cash In − Cash Out)
- Reports, Excel import, settings currencies (AFN/USD/EUR + extras)

This ledger is **account balances**, not physical till cash. Phase 3 does not change its calculations.

---

## Existing currency functionality

- Registry table `currencies`; UI reads the registry
- Customer module uses AFN, USD, EUR by default
- Amounts: TEXT + `decimal.js`; currencies are never mixed into one total
- Settings can add / deactivate / delete unused currencies

Teller denominations are a **child table** of `currencies`, so new currencies can gain notes later without a schema rewrite.

---

## Existing backup / restore functionality

Backup archives the SQLite file plus images and a manifest. Restore replaces the database atomically after a safety backup. Teller tables ride along in the same file. No extra backup format is required.

---

## Current application entry flow (before Phase 3)

```
Start → migrations → seed admin if empty
     → Login (or pre-login Restore)
     → Company setup if needed
     → Customer list (AppShell)
```

---

## Phase 3 architecture

Teller is a **new module in the same Electron app**, same database, same auth session, same company profile.

### New entry flow

```
Login → Company context
     → Module selection
          ├─ Customer Accounting  → existing AppShell
          └─ Teller / Cash Management → TellerShell
```

Switching modules does not log out and does not re-select the company. Session and `company_id` stay as they are.

### What Teller is

Physical cash / till management reconstructed from the Excel workbook `1405-05-18.xls` (business logic: denomination counting, Cash In/Out, Head Teller movements, Tally, Long Book, opening/closing). The UI is a professional desktop interface, not a spreadsheet clone.

### What Teller is not

- Not a rewrite of customer accounting
- Not a second installer or second database
- Not a cloud service
- Not an Audit Log product (forbidden). Teller rows still store `created_at` / `created_by` / `updated_at` / `updated_by` as ordinary financial metadata.

### Integration rule

A Teller **Customer Cash In** may reference `customers.id` so the teller can record who handed in cash. It does **not** automatically insert a row into `transactions`. Keeping ledgers separate avoids silently changing customer balances. Operators continue to use Customer Accounting for account balances.

---

## Teller database design

Normalized, data-driven, indexed for large history. Denominations are **rows**, not columns on the transaction table.

### `denominations`

Currency-agnostic note/coin definitions.

| Column | Notes |
|--------|--------|
| `id` | PK |
| `currency_code` | FK → `currencies(code)` |
| `value` | TEXT decimal (e.g. `1000`, `100`) |
| `sort_order`, `is_active` | display / availability |
| UNIQUE `(currency_code, value)` | |

Seeded:

- **AFN:** 1000, 500, 100, 50, 20, 10, 5, 2, 1
- **USD:** 100, 50, 20, 10, 5, 1

EUR and future currencies need only new `denominations` rows.

### `teller_transaction_types`

Extensible classification. Not a boolean IN/OUT-only schema.

| Code | Direction | Party |
|------|-----------|-------|
| `CUSTOMER_CASH_IN` | IN | CUSTOMER |
| `CUSTOMER_CASH_OUT` | OUT | CUSTOMER |
| `HEAD_TELLER_IN` | IN | HEAD_TELLER |
| `HEAD_TELLER_OUT` | OUT | HEAD_TELLER |
| `INTERNAL_TRANSFER_IN` | IN | INTERNAL |
| `INTERNAL_TRANSFER_OUT` | OUT | INTERNAL |
| `OPENING_BALANCE` | OPENING | OPENING |
| `ADJUSTMENT_IN` / `ADJUSTMENT_OUT` | IN / OUT | ADJUSTMENT |

Direction `IN` increases physical cash; `OUT` decreases it; `OPENING` is a snapshot (does not increment inventory a second time).

### `teller_sessions`

Working period for a teller in a company.

The current UI lifecycle is global: START creates/reopens the per-currency session records for every active currency in one action, and END writes one daily Excel workbook with one worksheet per currency before closing every open currency session together. Per-currency rows remain the persistence model so balances, denominations, OP carry-forward, and history are never mixed.

- `company_id` (default 1), `teller_user_id` → `admin_users`
- `opened_at`, `closed_at`, `status` (`OPEN` / `CLOSED`)
- `created_by` / `updated_by`
- At most one `OPEN` session per company (enforced in the service; unique index on open sessions)

### `teller_session_opening_denominations`

Traceable opening count per denomination for the session. Source of the Long Book opening line. Ledger of movements remains `teller_transactions`.

### `teller_transactions`

Authoritative cash movement header.

- `company_id`, `session_id`, `teller_user_id`
- `transaction_number` unique per company (e.g. `TL-000001`)
- `type_code`, `currency_code`
- `customer_id` nullable (required only for customer types)
- `amount` TEXT — canonical amount
- `denomination_total` TEXT — Σ(value × qty), must equal `amount`
- `validation_status` — only `OK` rows are persisted
- `note`, `transaction_date`
- `created_at`, `created_by`, `updated_at`, `updated_by`

Invalid / mismatched transactions are **rejected**, not stored as INVALID.

This phase does **not** allow editing historical teller cash transactions (avoids silent inventory rewrite). Opening is recorded at session open.

### `teller_transaction_denominations`

Line items: `transaction_id`, `denomination_id`, `quantity` INTEGER ≥ 0, `unit_value` TEXT snapshot, `line_total` TEXT.

### `teller_cash_positions`

Current physical pieces per `(company_id, denomination_id)`. Updated **in the same SQLite transaction** as the ledger insert. Not the only source of truth — the ledger can rebuild expected cash. Used so Cash Out can check inventory without scanning hundreds of thousands of history rows.

---

## Teller transaction model

1. Renderer sends type, currency, optional customer, optional declared amount, denomination quantities, note, date.
2. Main process binds `company_id` from `company_profile.id` and `teller_user_id` / `created_by` from the session.
3. Service recalculates `denomination_total` with `decimal.js`.
4. If declared amount is present, it must equal the calculated total; otherwise amount := calculated total.
5. Quantity must be a non-negative integer. Negative or non-integer quantities are rejected.
6. OUT types: each denomination quantity must be ≤ current `teller_cash_positions.quantity`.
7. Entire write (header + lines + position updates) runs in one `db.transaction()`.

Customer Cash In/Out require a real `customers.id`. Head Teller and internal types must **not** use a fake customer row.

---

## AFN denomination model

Data rows, not hardcoded table columns:

`1000, 500, 100, 50, 20, 10, 5, 2, 1`

Example: `1000 × 3` + `500 × 1` = `3500` AFN exactly.

---

## USD denomination model

`100, 50, 20, 10, 5, 1`

Same calculation pipeline as AFN. Currencies are never added together.

---

## Tally model

For a session and currency, per denomination:

```
Received pieces  = opening pieces + IN pieces (customer, head teller, internal, adjustment in)
Paid pieces      = OUT pieces
Remaining pieces = Received − Paid
Remaining amount = Remaining pieces × denomination value
Total cash       = Σ remaining amounts
```

Tally is computed from the session opening snapshot plus session ledger lines (indexed). Current `teller_cash_positions` is shown as physical till and compared during reconciliation.

---

## Teller Long Book model

Per session and currency, ordered by `transaction_date`, `id`:

```
Opening balance (from opening snapshot; not a typed-in closing figure)
For each IN movement:  running = previous + received
For each OUT movement: running = previous − paid
Closing balance = opening + total received − total paid
```

Closing balance is **derived**. The UI does not ask the user to type it. Stored opening snapshots and the transaction ledger are authoritative; any cached closing figure is display-only.

---

## Opening / closing balance model

- Opening: entered (or copied from current till) when a session is opened; stored as `teller_session_opening_denominations` plus an `OPENING_BALANCE` audit transaction that does not double-apply inventory.
- First session (empty till): opening quantities **set** `teller_cash_positions`.
- Later sessions: opening snapshot is the current till; inventory is not incremented again.
- Closing: `status = CLOSED`, `closed_at` set; closing amounts computed from opening + in − out.

Equation:

```
Opening + Cash In − Cash Out = Closing
```

---

## Data integrity rules

- Company scope: every Teller query includes `company_id` resolved in the service. Renderer-supplied company IDs are ignored.
- Session required for cash movements (except read of closed history).
- Amount = Σ(denomination × quantity) or the write is aborted.
- OUT cannot create negative piece counts (default: reject).
- No partial writes: SQLite immediate transaction.
- Foreign keys on session, type, currency, denomination, customer.
- Historical teller transactions are not silently rewritten.
- `validation_status` of saved rows is always `OK`.

---

## Financial calculation rules

- Use `decimal.js` (precision 40, ROUND_HALF_UP) — same as customer accounting `money.ts`.
- Never use JavaScript `number` for amount arithmetic.
- Store amounts as TEXT; store piece counts as INTEGER.
- AFN, USD, and any later currency remain exact TEXT decimals. Fractional coins (for example EUR 0.50) are supported.
- Do not mix currencies in a single total. Each currency has its own till, tally, long book, and reconciliation.

```
Calculated amount = Σ (unit_value × quantity)
```

Mismatch → `TELLER_AMOUNT_MISMATCH`. Insufficient pieces → `TELLER_INSUFFICIENT_CASH`.

---

## Testing strategy

New tests (Vitest):

- Denomination math: AFN, USD, zeros, mixed notes, invalid qty, mismatch
- Cash In: valid, invalid, inventory/tally update
- Cash Out: valid, insufficient total, denomination shortage, inventory update
- Ledger: opening, running, received, paid, closing
- Company isolation: rows with `company_id = 2` never returned for company 1
- Pagination / filters against a large synthetic Teller dataset
- Migration 007 applies cleanly on top of 001–006
- Regression: **entire existing suite must still pass**

Manual path (after automated tests): login → company → module select → accounting → switch to Teller → open session → AFN in/out → tally & long book → USD in/out → reconciliation → switch back → customer accounting still works.

---

## Migration strategy

1. Add `migrations/007_teller.sql` only.
2. Runner already applies new numbered files inside a SQLite transaction and records `schema_migrations`.
3. Seed types + AFN/USD denominations with `INSERT OR IGNORE`.
4. Existing customer data is untouched.
5. Backup/restore continues to copy the whole DB file.

---

## Git / commit strategy

1. Complete implementation and tests.
2. Run `npm test`, `npm run typecheck`, `npm run build` (`lint` is not defined).
3. Inspect `git status` / `git diff`; exclude junk, DBs, secrets.
4. Commit: `feat: add teller cash management system`
5. Push to the established remote branch (`origin main`) only when verification succeeds.

Version: bump to **1.1.0** (backward-compatible feature + schema addition). Default login credentials unchanged.

---

## Security (Phase 3)

- Session required on every `teller:*` channel
- `company_id` and `userId` taken from DB / session, not IPC payload
- Amount recomputed server-side
- Parameterized SQL only
- Other-company rows are indistinguishable from missing (`TELLER_TRANSACTION_NOT_FOUND` / empty lists)
- No SQL or filesystem IPC

---

## UI / reporting notes

Teller UI: sticky top summary (session, currency switcher, opening / cash in / cash out / current balance / physical cash / difference, transaction counts, Cash In / Cash Out actions), cash-desk workspace, Tally, Long Book, paginated history, session open/close, module switcher. Currency and denomination CRUD lives in Settings.

Reports architecture: query helpers (dashboard, tally, long book, filtered history) are designed so daily AFN/USD/Cash In/Cash Out/Tally/Long Book/reconciliation reports can be added later without restructuring tables. This phase ships interactive views of those datasets rather than every PDF template.

---

## Excel workbook mapping

The workbook `1405-05-18.xls` is the business-logic reference. Broken Excel artifacts such as `#REF!` are not copied. Intended concepts preserved:

Deposit, Withdrawal/Paid, Cash Received From Head Teller, Cash In/Out, denomination counting, amount check, totals, remaining pieces/amount, Tally, opening, running balance, total received/paid, closing, Long Book, AFN, USD.

---

## Excel Parity Audit

Fresh inspection of `1405-05-18.xls` (authoritative Teller workbook) against FMT 1.1.0 after the dynamic-currency refinement. The UI is not a spreadsheet clone; accounting behavior is.

### Workbook surfaces discovered

| Excel sheet / area | Intended business rule | FMT location | Status |
|---|---|---|---|
| `"AFN "` Deposit/Withdrawal Final Sheet | Per-line `Σ(qty × denomination)`; Check `IF(amount = calculated, "OK", "NO")`; deposit/withdraw TRS counts; H.T. and ICBA columns | `TellerService.createTransaction`, `denominationMath.ts`, cash-desk form | **Corrected / stricter** — FMT rejects mismatch instead of saving a `"NO"` row |
| `" USD"` | Same model, USD denominations 100/50/20/10/5/1 | Same engine, USD-seeded `denominations` | **Correct** — currency-agnostic Σ |
| `"tellay "` Tally | Remaining pieces = received − paid; remaining amount = remaining × value; total cash = Σ remaining amounts | `getTally`, `remainingPieces` / `remainingAmount` | **Correct** |
| `"AFN-L-B"` / `"USD-L-B"` Long Book | Opening + received − paid = closing; running = previous ± movement; date, reference, party | `getLongBook` (SQL-paginated) | **Correct** (see `#REF!` notes) |
| Opening (`OP`) | Snapshot of till at session open; not a second inventory increment | `openSession` + `teller_session_opening_denominations` + `OPENING_BALANCE` audit row | **Correct** |
| Head Teller (H.T.) | Distinct from customer deposit/withdraw; still moves cash, tally, long book, recon | `HEAD_TELLER_IN` / `HEAD_TELLER_OUT` | **Correct** |
| ICBA / internal cash | Distinct correspondent/internal columns | `INTERNAL_TRANSFER_IN` / `INTERNAL_TRANSFER_OUT` in party selector | **Added to cash-desk UX** |
| Transaction counts | Count committed deposit TRS, withdraw TRS, H.T. movements; ignore failed rows | Session totals + type counts; writes only persist `validation_status = OK` | **Correct** |
| Reconciliation | Expected vs physical vs difference | Dashboard summary + `getReconciliation` | **Correct** — discrepancy is shown, not hidden |
| Negative piece counts in Excel | Some rows used negative qty for change-making | FMT forbids negative qty and denomination-level shortage | **Intentional** — do not copy Excel’s negative-qty workaround |
| Hard-coded AFN/USD only | Excel has two live currency sheets | Normalized `currencies` → `denominations` → `teller_transaction_denominations` | **Extended** — unlimited currencies |

### `#REF!` and other Excel defects not reproduced

- Long Book sheets contain broken references to a deleted `'Long BooK  Paid'` (and similar) range. FMT does **not** store or display `#REF!`.
- Intended equivalent: one chronological Long Book per currency with opening row + IN as Received + OUT as Paid and a derived closing balance.
- Excel allowed `"NO"` (amount ≠ denomination total) to remain on the sheet. FMT aborts with `TELLER_AMOUNT_MISMATCH`.
- Excel sometimes recorded negative piece counts. FMT keeps non-negative integers and rejects Cash Out that would make any denomination negative, even if another denomination’s total would cover the amount.

### Calculations confirmed

```
Transaction total = Σ(denomination value × quantity)   // any currency
Tally remaining pieces = received pieces − paid pieces
Tally remaining amount = remaining pieces × denomination value
Physical cash = Σ(remaining amount)                    // that currency only
Long Book closing = opening + total received − total paid
Running = previous ± this movement
Reconciliation difference = physical − expected
```

A USD (or EUR, PKR, …) movement never changes another currency’s inventory.

### Dynamic currency architecture

- `currencies.display_name` plus existing code/symbol/active flag (migration `008_dynamic_currencies.sql`).
- Denominations stay in `denominations` (value TEXT, not `afn_1000` columns). Historical rows keep `denomination_id`.
- Settings: create currency (name, code, symbol) and add/deactivate/delete denominations. In-use denominations cannot be hard-deleted (`DENOMINATION_IN_USE`); deactivate instead. Currencies with history stay as inactive records (`CURRENCY_IN_USE`).
- Seeded AFN/USD data is preserved. EUR now has a standard note/coin ladder so it is usable immediately.
- Core math has no `if (currency === 'AFN')` branches.

### UX changes (this pass)

- Critical session / currency / opening / cash in / cash out / current balance / physical cash / difference / counts / last movement sit in a **top summary bar** (does not scroll away with the working table).
- Prominent **+ Cash In** / **− Cash Out** on that bar; Head Teller and Internal/ICBA are first-class party choices on the cash desk.
- Currency switcher drives denominations, tally, long book, history, and the summary for the selected currency only.
- Live denomination grid: calculated total, amount verified / mismatch with entered vs calculated vs difference; save disabled on mismatch.
- Settings currency manager for unlimited currencies and per-currency denominations.
- History/long book remain paginated (default 50); dashboard totals read session aggregates, not the full ledger.

### Tests added or extended

- Excel-style Σ for AFN, USD, EUR fractional coins, and a large-unit currency.
- Custom PKR (+ EUR) Cash In/Out, isolated tally/long book, Head Teller and internal counts, reconciled / surplus / shortage difference.
- Currency display names, EUR seed ladder, arbitrary denomination create/delete, `DENOMINATION_IN_USE`.
- Migration 8 (`display_name`, EUR 13 denominations).
- IPC channels for denomination CRUD.

Do not remove these rules in later work: mismatch reject, denomination-aware negative till, opening snapshot vs inventory, Head Teller ≠ customer, per-currency isolation, active/inactive rather than destroying history.
## Current module boundaries

Customer Accounting is the permanent financial record. Its customers, transactions, balances, company identity, account configuration, and related photos are the scope of accounting backups and recovery. Teller is a live operational worksheet for the current working day. A successful END TODAY Excel workbook is Teller's long-term archive; the database only needs to protect active work through restart/crash and until export succeeds. Teller history is not an accounting-backup recovery contract.

Accounting and Teller own separate currency registries and denomination configuration. Authentication, company identity, theme, and localization may be shared infrastructure, but changing one module's currencies must not change the other module's balances, selectors, or worksheet configuration. Authoritative money calculations use decimal text and exact decimal arithmetic; floating point is presentation-only.
