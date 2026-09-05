# FMT engineering operating guide

## Authoritative product rules

Customer Accounting is permanent financial storage and the scope of CAB backup/recovery, including customers, transactions, company/account configuration, and related photos. Teller is a live operational worksheet. Its SQLite rows are protected for active-day restart/crash safety until END TODAY succeeds; the successfully exported Excel workbook is the long-term Teller archive. Teller history is not required to be reconstructed from accounting backups.

Accounting and Teller own independent currency and denomination configuration. Shared authentication, company identity, theme, and localization do not imply shared business data. No authoritative money calculation may use floating point, and every failed Teller save must remain visible to the operator.

Repository audit baseline: 2026-09-05, HEAD `483d555de1fb795f2e29b984de9bdbfdc804f0ba`, package version 1.4.1. This guide describes the working tree, including pre-existing, uncommitted Teller worksheet-row work and migration 011. Recheck the current tree before using version-specific statements. This is an operating guide, not a release certification.

## Project identity

FMT is a single-administrator, offline-first Windows 10/11 x64 desktop application for customer accounts and physical Teller cash worksheets. One Electron application, one local SQLite database, one authentication session, and one company profile support both modules. Daily accounting does not require internet; the updater fetches application binaries from GitHub Releases.

Stack: Electron 34, React 18, strict TypeScript 5, electron-vite, better-sqlite3, bcrypt, decimal.js, i18next/react-i18next, PDFKit, ExcelJS, and electron-builder/NSIS. Use the package manifest and lockfile for exact installed/dependency versions.

Brand: FMT. Keep compatibility identifiers `customer-accounting` (npm), `com.customeraccounting.app` (app ID), and `%APPDATA%\CustomerAccounting` (user data). `src/main/index.ts` also preserves a legacy `%APPDATA%\FMT` installation when the preferred folder does not exist. Do not rename these paths casually. Application installation paths are distinct from user-data paths; old docs disagree about the Programs folder name.

## Sources of truth and reading order

1. Follow the current user request and its authorized scope. Inspect `git status`, the current diff, and any applicable local instructions before editing.
2. Read `PROJECT_CONTEXT.md`, `project-context/README.md`, `project-context/AI_INSTRUCTIONS.md`, `project-context/release-readiness.md`, and relevant feature documents for requirements and historical intent.
3. Verify current behavior in actual source and the current working diff. Migrations plus the migration runner define persisted schema and upgrade behavior. Tests provide executable examples, not proof of untested safety. `package.json`, `package-lock.json`, scripts, and the release workflow define toolchain/build behavior.
4. `project-context/architecture.md` exists; there is no root `ARCHITECTURE.md` at this baseline. It is incomplete and partly historical. Do not treat diagrams, pseudocode, old test counts, or a CURRENT label as stronger evidence than implementation.
5. When documentation and code conflict, describe both current behavior and intended requirement. Investigate related tests/history, report material conflicts, and do not silently change the product to match stale prose. Update affected documentation when an authorized behavior/architecture change warrants it.

Important historical drift:

- Much of `PROJECT_CONTEXT.md` describes migration-007 Teller inventory, customer FKs, transaction types, mismatch rejection, and immutable movements. Migration 009 replaced that model. Its later worksheet/global-day notes do not make its older sections current.
- `backup-restore.md` section 7 correctly describes the current accounting merge. Other documents still claim full replacement, restored credentials, or session invalidation. None of those occurs in the current service restore path.
- `coding-rules.md` mentions Tailwind, service-returned Result values, and repository locations that do not match implementation. Actual styling is custom CSS; services throw AppError and IPC wraps results.
- Release-readiness and testing documents contain historical results. Re-run appropriate verification before making new passing/release claims.

## Repository map

| Location | Responsibility |
| --- | --- |
| `src/main/index.ts` | Identity, single instance, window security, bootstrap, updater scheduling, quit orchestration |
| `src/main/services/applicationContext.ts` | Database startup/migrations/admin seed and service dependency composition |
| `src/main/config/` | App/data/migration/font/icon paths and runtime configuration |
| `src/main/database/` | Connection, numbered SQL migration runner, entity repositories |
| `src/main/ipc/` | Typed IPC registration, authentication gates, input parsing, native dialogs |
| `src/main/services/` | Auth, customers/photos, company/logo, transactions/transfers, currencies, settings, import, reports, backup, update, Teller |
| `src/preload/index.ts` | Explicit contextBridge API and allowed invoke channels; restricted event subscriptions |
| `src/shared/` | IPC/domain types, locale/amount/date/theme helpers, pure Teller worksheet/calculation helpers |
| `src/renderer/` | React pages/components, AuthContext, local view state, translations, styles |
| `migrations/` | Sequential SQL, currently 001 through 011 in the working tree |
| `assets/` | Bundled offline fonts/icons and NSIS customization |
| `tests/unit`, `tests/integration`, `tests/helpers` | Vitest tests, temporary SQLite harnesses, scale/export fixtures |
| `scripts/` | Native rebuilds, build guards, icon/font tooling, installer verification |
| `.github/workflows/release-win.yml` | Windows build/test/package and GitHub asset upload on `v*` tags |
| `out/`, `dist/` | Generated application and installer output; never edit as source |

## Architecture and dependency boundaries

Representative flow: React UI -> explicit `window.api` method -> typed IPC handler -> service -> repository/SQLite. Shared helpers may calculate display previews, but main validates and calculates authoritative writes.

- Renderer must not access SQLite, Node filesystem, or arbitrary IPC. Keep `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and `webSecurity: true`.
- Extend IPC contracts together: `src/shared/types/ipc.ts`, handler registration, preload methods, and renderer typing (`env.d.ts` uses the preload API). Preserve `{ ok: true, data } | { ok: false, errorCode, message? }` wrapping.
- Business rules belong in the relevant service/shared pure helpers; repositories handle persistence. Some existing services contain direct SQL (customer reference detachment, imports, backups); do not invent a new architecture merely to make those match old prose.
- Protected handlers call `requireSession`. Public exceptions include login/recovery, session checking, settings read/language-only update, backup validation/restore, and native automatic-backup location selection. Pre-login recovery access is intentional.
- Teller identity is bound to `session.userId`; company resolves to the singleton company profile (`id = 1`). Renderer-supplied company/user identity must not become authoritative.
- `App.tsx` uses React view state, not react-router: login/recovery/restore -> company setup if needed -> module selection -> AppShell or TellerShell. Module switching shares authentication.
- Customer Accounting and Teller share currencies, denominations configuration, company, auth, and the database, but their ledgers are intentionally separate. Current Teller has no customer FK and never posts customer transactions.
- `TellerHistoryPage`, `TellerLongBookPage`, and `OpenSessionForm` exist but are not mounted by the current TellerShell. Their existence does not mean these screens are reachable.

## Business-critical rules

### Customer Accounting

- Customers may have blank names/numbers/photos; duplicate customer numbers are allowed. IDs, not names, identify records.
- Cash In increases, Cash Out decreases a customer's balance in exactly one currency. Balances are computed on read, not stored on customers. Zero balances remain visible.
- Amounts are positive decimal strings with at most four decimal places. Decimal helpers use precision 40 and ROUND_HALF_UP; computed balances use four decimal places. Do not introduce binary floating-point financial arithmetic. Existing SQL REAL aggregation is a known limitation, not a pattern to expand.
- Ordinary Cash Out and edits may yield negative balances. Transfers require sufficient source balance inside the same database transaction that inserts both legs.
- Transfers share `transfer_id`, have OUT/IN roles and counterparty links. Individual transfer legs cannot be edited; transaction deletion by transfer ID removes all matching rows.
- Customer deletion nulls counterparty references and cascades that customer's transactions, then removes the photo. Surviving counterparty ledger entries are retained. SQL and file operations are not one filesystem-atomic transaction.
- Lists/search are SQL-paginated; exact C-/RARE-number search has an indexed shortcut, partial search uses LIKE. Transaction pagination can intentionally be disabled, returning all history for that customer.
- Excel import validates/collects issues, previews, then commits accepted accounting rows in one immediate SQLite transaction. Matching is by customer number, or name when no number exists. Possible duplicate transactions are warnings, not automatic rejection. Photos are saved after commit.
- Currencies are dynamic (seeded AFN/USD/EUR). New transactions use active currencies. Do not remove the last active currency or hard-delete referenced currencies/denominations. The exchange calculator uses a manually entered rate and creates no ledger postings.

### Teller / Cash Management

- Current model: `teller_sessions`, `teller_session_ht_denominations` (OP piece counts despite its historical name), `teller_transactions`, `teller_transaction_denominations`, and the shared currency/denomination registry.
- One session per company/currency/business date; at most one open session per company/currency. Global START visits every active currency in a database transaction. Business date advancement is implemented by `startCurrencyDay`/`openFollowingBusinessDay`; it can advance from a prior closed date rather than simply use the wall-clock date. Preserve tests and inspect this logic before changing it.
- END exports all open currency sessions into one XLSX workbook, one worksheet per currency, then closes the sessions together. Cancellation/export failure must not close them. Export completion and SQL close are separate phases, with a concurrency concern noted below.
- OP opening amount and opening pieces are distinct from Opp-Amount and from ordinary transaction rows. Prior closing is carried into the next session; no invented pieces are derived from the amount alone.
- Deposits/withdrawals use a free-form reference label and optional declared amount. Mismatches are saved with Check NO and variance = declared minus counted; they are not rejected. A blank declared amount uses the counted total for cash movement. Explicit zero and blank are different.
- Denomination total = sum(value * quantity). Amount closing = OP + deposits - withdrawals, using declared amount when present. Net tally pieces may be negative; closing carry-forward pieces currently clamp each negative denomination to zero. These are current behaviors, not permission to redesign reconciliation.
- USD RESULT = counted grand total minus Opp-Amount. Other currencies use Opp-Amount + ICBA in - ICBA out. Preserve this tested currency-specific rule even though registry/denomination math is dynamic.
- Transaction counts count nonblank declared amounts (including explicit zero), not every saved row. Opening is not a transaction count.
- Open-session rows can be edited/deleted; closed-session mutations are rejected. RESET zeros OP/counts and deletes current-session movements only for the selected currency; previously closed history remains. UI confirmation is required.
- Migration 011 preserves per-session/per-direction worksheet row slots. Deposit row 1 is OP; deposit movements start at 2 and withdrawals at 1. Do not compact gaps, substitute array index for row identity, or overwrite active drafts during asynchronous refresh.

## Database and migration safety

- Main opens `data/accounting.db` with WAL, foreign keys ON, busy_timeout 5000, synchronous NORMAL, and an integrity check. It fails closed on corruption; it does not reset the database.
- `migrationRunner.ts` discovers zero-padded numbered SQL filenames in lexical order, skips recorded versions, and applies each pending SQL file plus its version record in a transaction. The whole sequence is not one transaction. Applied `schema_migrations` is the operational schema-version authority, not stale `app_metadata` values.
- Add the next numbered migration for authorized schema changes. Do not edit already-applied migrations or reset a database to make tests pass. Test upgrades from populated earlier schemas as well as fresh initialization and failed migration rollback.
- Protect existing installed databases, image references, transfer links, and backup compatibility. A new installer preserves the data directory but pending SQL can still change/delete its contents.
- Migration 009 already drops/recreates old Teller tables without copying their data. Startup has no general pre-migration backup step. This is a confirmed upgrade data-loss hazard for populated 007/008 databases; never copy it as a safe migration pattern or rewrite that historical file casually.
- Migration 010 creates a unique date index without deduplicating existing sessions and does not update `app_metadata.schema_version`. Inspect real upgrade fixtures before release claims.

## Backup, restore, shutdown, and update safety

- `.cab` format 1.0 is an unencrypted ZIP-compatible full database plus customer/company images, manifest and SHA-256 integrity digest. `signature.sha256` is unkeyed integrity metadata, not a cryptographic signature proving origin.
- Creation checkpoints WAL and copies/stages files, then writes the archive. Auto-close, safety, and pre-update paths validate after creation; manual `create()` itself does not round-trip validate.
- Automatic close backups use the chosen `settings.automatic_backup_path`, unique FMT-AutoBackup filenames, and no pruning. No configured directory means skip. The current has-data gate only counts customers/customer transactions, so Teller-only data is skipped: known defect.
- QuitBackupCoordinator attempts backup once, with a nominal 120-second timeout, then shutdown checkpoints/closes the DB and clears the crash sentinel. Failure does not block quit. Synchronous archive work cannot be preempted by a JS timeout.
- Current restore is an additive customer-accounting merge, not full-system recovery: migrate a temporary incoming DB, insert currencies/denominations if absent, insert new customers, remap customer/counterparty IDs, insert transactions, copy customer photos. It does not restore Teller, admin, settings, company, or company logo; service reports `sessionInvalidated: false`.
- Existing accounting data triggers a validated safety archive before merging (retain five matching safety files). SQL failure rolls back inserts; photo-copy failure after commit does not roll them back. Repeated merge imports duplicate customers/transactions.
- Do not silently replace the merge with full restore. The v1.2.4 history explicitly introduced merge semantics. Report the recovery gap and obtain a scoped product request for any replacement recovery workflow.
- Updates use public GitHub Releases and generated `app-update.yml`; no end-user token or runtime setFeedURL. Auto-download, auto-install-on-quit, downgrades, and differential download are disabled. Checks are scheduled after packaged startup; the 24-hour throttle is in memory.
- Installation requires a validated pre-update backup (retain five), then silent `quitAndInstall(true, true)`. That path skips the redundant close backup. Update failures must not stop offline startup/use.

## UI, localization, and reports

- Preserve existing custom CSS/theme tokens in `src/renderer/styles/global.css` and `src/shared/theme.ts`, including light/dark mode. Do not introduce Tailwind based on old documentation.
- Cash In is green, Cash Out red; positive/negative balance colors are display-only. Preserve compact desktop layouts, fixed headers/summary areas, appropriate table-body scrolling, logical CSS properties, keyboard worksheet navigation, and confirmation for destructive actions.
- Languages: en (LTR), fa-AF/Dari and ps/Pashto (RTL). Update all three locale namespaces for user-visible changes, including teller. `LocaleBootstrap` loads persisted language/theme before rendering; i18n updates document lang/dir. Latin numeric input and local wall-clock transaction dates are established conventions.
- Reports run in main: UI -> reports handler/validation -> ReportsService model -> PDFKit/ExcelJS -> cache file -> native save dialog. Company profile/logo feeds customer report headers. All-customer reports query 500-row batches but still materialize the final model in memory.
- Preserve logical Unicode PDF wrapping, bidi run placement, whole-run `features: []`, embedded Inter/Noto Naskh Arabic/Vazirmatn, and the fontkit null-anchor compatibility guard. Do not replace shaping with string reversal or presentation forms in the drawing path. Main report code may read renderer locale JSON as shared translation data.
- Teller XLSX is a separate workbook export with hardcoded English headings and no locale parameter/RTL view at this baseline; customer-report localization does not automatically apply to it.

## Testing requirements

Normal authorized development verification:

- `npm run typecheck` for TypeScript/IPC/shared/renderer changes.
- `npm test` for behavior changes; update regression tests to cover the requested behavior and affected service/handler/repository interactions. It runs `pretest -> rebuild:node` before Vitest.
- Teller changes: worksheet row/navigation/math/session/service tests plus migration tests where persistence changes. Verify OP, blank versus zero, mismatch rows, cross-currency isolation, export failure and draft refresh behavior.
- Accounting changes: transaction/transfer/customer/repository/handler tests plus import/report consequences. Backup/update/security changes require their relevant service and integration tests, including failure paths.
- UI/locale/report changes also need visual checks in EN/Dari/Pashto and light/dark modes. Automated PDF structure tests do not establish visual readability in a real PDF viewer or printer.
- `npm run build` for bundle changes; `npm run build:win` and clean Windows install/update/uninstall-preserves-data checks before release claims.
- `npm run test:extreme` is explicit, resource-intensive 1M/5M verification. Default Vitest skips it. Do not claim this scale from the existence of fixtures or old notes.

Vitest uses Node, includes `tests/**/*.test.ts`, and sets fileParallelism false. Tests create/delete temporary databases and artifacts. There is no lint script, implemented Playwright E2E suite, or general React component test suite at this baseline.

For read-only audits, do not run npm test/build/install/rebuild, formatters, app startup, or artifact generators. To typecheck without generating tsbuildinfo, use both commands:

```text
node node_modules/typescript/bin/tsc --noEmit --incremental false --composite false -p tsconfig.node.json
node node_modules/typescript/bin/tsc --noEmit --incremental false --composite false -p tsconfig.web.json
```

Both passed during the 2026-09-05 audit; runtime tests/builds were not run.

## Build/release and Git discipline

- package.json is the application version source; `APP_VERSION` imports it and main prefers Electron app.getVersion(). Database metadata is not the running version source.
- `predev`/`prebuild` rebuild bcrypt and better-sqlite3 for Electron; `pretest` rebuilds them for Node. Never package Node-target or another OS's binaries as Electron Windows binaries.
- Build Windows installers on Windows x64 or the windows-latest release workflow. A prior Linux-built Windows installer shipped ELF native modules and failed at startup. Preserve build-host guards and packaged PE verification. PE-header verification alone does not prove Electron ABI compatibility; packaged launch checks remain necessary.
- `npm run build:win` builds to out/, packages dist/FMT-Setup.exe, checks native files and installer metadata/checksums. `verify-win-installer.mjs` writes SHA256SUMS.txt; it is not read-only. Fonts/icon scripts and afterPack mutate generated assets/binaries.
- `run-verify.cmd` installs dependencies, writes reports/logs, launches the real dev application, and ends by force-killing every electron.exe process. Do not use it as a routine safe/read-only verifier; prefer the individual scoped commands above.
- NSIS is assisted per-user installation, preserves app data on uninstall, and uses custom silent update handling. Signing is not configured. Do not claim unsigned artifacts are Authenticode-verified.
- Observed release branch: main; remote origin is HashmatKhanSediqi/sameer-desktop-app. Existing tags use v-semver, through v1.4.1 at audit. The workflow publishes FMT-Setup.exe, latest.yml, and SHA256SUMS.txt on v* tags; it does not currently upload a blockmap.
- Historical docs show feature/ and fix/ branches; history also contains cursor/ branches. These are examples, not an enforced exclusive naming policy. Follow current user/tool branch instructions (Codex defaults to codex/).
- Inspect and preserve pre-existing modifications/untracked files. Never stage unrelated files, commit databases/secrets/build output, or use reset/checkout/clean to discard the user's work. Finish with diff/status and report exactly what changed and what was verified.

## Known audit concerns to recheck before affected work

These were reported, not fixed; inspect current source before assuming they remain:

- Destructive 009 Teller upgrade; full-system backup lacks a full-system recovery path; corruption aborts bootstrap before a recovery window can open; Teller-only close backup is skipped.
- Backup merge preserves original transfer_id while inserting duplicate new customers/legs. Reimporting the same transfer can cause later delete-by-transfer-ID to delete original and imported copies together.
- Retiring a used denomination hides it from TellerRepository.listDenominations, while stored counts still include it. normalizeCounts then rejects sheet/transaction hydration; history totals may omit inactive values.
- Global START requires denominations for every active currency; a currency created in Accounting settings without denominations can block START for all currencies.
- SQL REAL aggregation/transfer balance checks and XLSX numeric conversion lose exact decimal precision at sufficiently large accepted amounts.
- Teller row/metadata save failures are ignored by TellerSheetPage; endDay snapshots before awaiting XLSX I/O and has no service-level write/finalization lock.
- Quantity parser uses parseInt for string values (truncation/trailing garbage accepted); business-date validation checks shape but not calendar validity. Trusted OP parsing is also exposed by session-update input.
- Migration tests cover fresh/repeated application and SQL failure, not preservation of populated old Teller schemas. Existing green typechecks do not establish safe upgrades or complete recovery.

## Change discipline and actions requiring explicit scope

Before implementation: inspect relevant architecture and dependencies; make the smallest justified change; preserve behavior outside the request; update meaningful tests when behavior changes; update documentation when architecture/business rules change; report unexpected architectural concerns before redesigning around them.

Do not perform database resets, destructive migrations, user-data deletion, architecture rewrites, accounting/Teller semantic changes, backup-format or restore/update mechanism changes, security-model changes, major dependency upgrades, version/release/tag creation, commits, or pushes unless explicitly authorized by the user for that work. Existing authorization is sufficient; do not ask again for routine steps already within scope. A review/audit is not authorization to fix the findings.
