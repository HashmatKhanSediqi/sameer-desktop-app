# Recovery completion verification — 2026-09-06

Scope: complete FMT-04 recovery and verify FMT-05 through FMT-09 after starting from `a9c9140f05c57729e4cdf43d2660dedaf0bdf399` on main. Version remains 1.4.1. This is source verification, not installer/release certification.

## Recovery contract

Healthy initialization opens FMT normally. Failed initialization exposes only four recovery IPC actions, bound to the recovery window's main frame: status, native backup selection/validation, restore, and transition to login. The recovery renderer has no normal API. Electron isolation, sandbox, and web security remain enabled.

Selection validates CAB archive structure, manifest, file hashes/integrity metadata, SQLite integrity/foreign keys, and schema compatibility. Restore revalidates the bytes, copies the snapshot and images to staging, runs migrations and verifies the application schema/service context there, and closes staging before touching live data.

The complete failed data directory, including database sidecars and images, is moved to a unique timestamped pre-recovery directory on the same volume. Failure to preserve stops with an explicit error. After installing the staged data, normal initialization must succeed again before success is reported. Failure preserves the original safety copy, retains the rejected replacement where possible, restores the original directory, and leaves recovery available for retry. A durable pending marker prevents interrupted replacement from silently starting a new empty database.

Success opens a fresh normal login window using restored credentials; no old session survives. Customer Accounting, its company/account configuration, and related images are the recovery target. The CAB snapshot may contain Teller rows, but reconstructing Teller history is not a recovery guarantee: exported daily Excel workbooks remain its permanent archive. Normal in-app additive import is unchanged.

## Verification

- `npm.cmd test`: **364 passed, 0 failed, 1 skipped**, across **74 passed test files and 1 skipped file**. The skipped extreme-scale suite is explicitly gated; no 1M/5M claim is made.
- Targeted recovery, precision/import/isolation, migration, and save-queue run: **27 passed, 0 failed** across four files (included in the full suite).
- `npm.cmd run typecheck`: passed.
- `npm.cmd run build`: passed, including the intended Electron native rebuild. No installer command was run.
- `node node_modules/electron/cli.js tests/electron/recoverySmoke.cjs`: **18 assertions passed, 0 failed** against a separate temporary AppData directory. It exercises actual built recovery IPC/preload/UI, invalid-backup retry, migration 012 from a supported 011 snapshot, preservation, return to login, restored-credential authentication, failed Teller drafts, END blocking, and rapid-edit persistence. Recovery screenshots were inspected in EN/Dari/Pashto and light/dark themes.

The prior Windows lock was a repository Electron development process (PID 17548) with this repository's `better_sqlite3.node` loaded. Gracefully closing its main window released the lock and ended its development process. No unrelated Electron processes were terminated. The smoke harness uses visible temporary windows because hidden-window capture can stall; it has a bounded watchdog and exits its own Electron process.

FMT-05 regression coverage verifies distinct transfer IDs for repeated imports and independent deletion. FMT-06 covers retained retired denominations in active sheets/export and next-day carry-forward. FMT-07 covers independent registries and a populated migration-012 upgrade. FMT-08 covers exact four-decimal totals, large cancellation, fractional accumulation, report totals, and transfer boundaries. Repeated searches found floating-point conversions only in money display/locale formatting and Excel numeric output, not authoritative accounting totals. Excel's numeric precision remains a presentation limitation.

FMT-09 now serializes/coalesces writes, retains failed drafts/errors across unrelated successes, retries failed saves, protects drafts from stale refreshes, and prevents END/module/currency navigation from hiding pending failures. Export finalization rejects concurrent Teller writes. Tests cover validation, authentication, database and IPC-style failures and stale responses.

## Legacy upgrade follow-up

The historical migration-009 risk was closed on 2026-09-06 without editing the shipped SQL. The migration runner now protects and converts schema-007/008 open operational Teller work. See [legacy Teller upgrade](legacy-teller-upgrade.md).
