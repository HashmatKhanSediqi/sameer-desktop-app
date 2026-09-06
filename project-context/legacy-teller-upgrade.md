# Legacy Teller upgrade safety — 2026-09-06

## Hazard and legacy model

Shipped migration 009 replaces the schema-007/008 Teller model by dropping its tables. The old model used one company-wide session, typed transactions with customer/head-teller/internal categories, per-currency summary totals, opening denomination lines, denomination movement lines, and current cash positions. Migration 008 adds display names and EUR denominations but does not change those Teller structures. The shipped SQL did not copy any of that data.

Teller's long-term archive remains the exported Excel workbook. The upgrade guarantee is narrower and operational: any open, unexported session must remain usable, while all old data must remain recoverable. Closed legacy rows are therefore retained in the pre-migration safety database rather than forced into the current operational schema.

## Compatibility path

When `schema_migrations` contains 007 or 008 but not 009, the migration runner:

1. checkpoints WAL into the main database;
2. copies the complete SQLite database to a unique `accounting.db.pre-migration-009-<timestamp>[-suffix].db` in the configured backups directory;
3. opens that copy read-only and requires SQLite integrity validation;
4. stops before migration 009 if creation or validation fails;
5. snapshots every legacy Teller table inside migration 009's transaction using persistent compatibility tables;
6. applies the unchanged shipped migration 009 and records it normally;
7. after migration 010 adds opening/Opp-Amount columns, converts each open legacy session into one current session per represented currency;
8. carries session date, status, note and audit identity; opening amounts/counts; IN/OUT movements as deposit/withdrawal rows; declared amounts; labels; and denomination quantities;
9. removes compatibility tables only after conversion succeeds, then continues through worksheet-row migration 011 and independent currency ownership migration 012.

Persistent compatibility tables make the process restartable if the process stops after 009 and before 010. A conversion failure rolls back migration 010 and leaves those tables plus the validated safety database available for the next attempt. Already-upgraded databases never run the compatibility path. Fresh databases also skip it because they have no pre-existing 007/008 migration state.

The old `teller_cash_positions` and `teller_session_currency_totals` are derived state and are retained in the safety database. Current opening plus denomination movements reconstruct active counts and exact closing amounts; tests verify the result rather than copying obsolete aggregates.

## Verification scope

Automated fixtures cover fresh/repeated current migrations, empty and populated schema 007/008 upgrades, multiple currencies, openings, deposits, withdrawals, quantities, business date, exact calculated closing, workbook export, blocked safety-copy creation, an interrupted 009-to-010 resume, populated 011-to-012 migration, and already-current startup. Customer Accounting rows are asserted unchanged through legacy conversion.
