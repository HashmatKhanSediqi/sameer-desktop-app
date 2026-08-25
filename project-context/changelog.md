# Changelog

All notable changes to **FMT** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Light/Dark color mode in Settings → Appearance, persisted with the existing theme settings.

### Changed
- Restore from Backup and Import Existing System add backup accounting data to the current system instead of replacing it. Existing customers, transactions, settings, company profile, and the admin account stay in place. Backup customers receive new local IDs when they would collide, and their transactions follow those new IDs.
- Customer Details hides the global application header and uses the recovered vertical space.
- Customer Accounting list places `Transfer` immediately beside `Add Customer`.
- Login secondary actions (`Forgot password`, `Import Existing System`) are text actions without underlines, with hover/focus/active states.
- Global header sizing matches the compact Customer Accounting header on every page.
- Customer Accounting and Customer Details summary cards expand to fill available row width (`auto-fit`).
- Customer delete confirmation shows a checkmark and success message in the same dialog, then closes after about one second.
- Settings uses a left navigation and content panel, with action feedback inside the relevant section or modal.

### Fixed
- Customers with the same name can be deleted independently. Transfer counterparty links no longer block deletion.
- Restore from Backup and Import Existing System no longer fail with "The request is invalid" after a backup file is selected.
- Login screen no longer has a page or form scrollbar; the form is sized to fit the viewport.
- Customer list `Action` header and Customer Details `Edit Transaction` header scroll and align with the rest of the table instead of staying independently sticky.

---

## [1.2.3] — 2026-08-25 (Windows native module packaging fix)

### Fixed
- **Critical:** Windows releases built on Linux contained Linux ELF native modules (`bcrypt_lib.node`, `better_sqlite3.node`), causing `is not a valid Win32 application` after in-app update from v1.2.2. Windows installer builds now require a Windows x64 host and verify packaged `.node` files are PE binaries before release.
- In-app update download no longer resets progress for a duplicate in-flight request; differential NSIS downloads are disabled to avoid a full re-download fallback after a partial blockmap attempt.

### Changed
- Added GitHub Actions workflow (`.github/workflows/release-win.yml`) to build and attach `FMT-Setup.exe` and `latest.yml` on `windows-latest` when a version tag is pushed (differential/blockmap updates disabled).

### Known issue
- **v1.2.2** must not be used. Users who updated to v1.2.2 should reinstall from the v1.2.3 (or later) full installer over the broken installation; user data in `%APPDATA%\CustomerAccounting\` is preserved.

---

## [1.2.2] — 2026-08-25 (UI layout and scrolling — **broken Windows native modules**)

### Changed
- Application background is pure white (`#FFFFFF`); green branding, cards, and accents unchanged.
- Login page fits the viewport without page scroll; password field includes a show/hide toggle with accessible labels.
- Customer currency summary cards use a tighter grid with less empty space.
- Post-login module selection cards are slightly smaller and more compact.

### Fixed
- Customer list: search/actions bar and currency totals stay fixed; only the customer table scrolls; Actions column stays visible while scrolling.
- Customer details: transaction action header stays fixed; only the transaction list scrolls; Edit Transaction modal footer stays visible while the form body scrolls.

---

## [1.2.1] — 2026-08-24 (update install, accounting scroll)

### Fixed
- In-app install from Settings failed at the last step with "Update was not installed because the safety backup could not be completed." On this machine the live database is schema **8** (teller + dynamic currencies). Packaged **1.0.2** only ships migrations 001–006, so `createPreUpdateBackup()` validation rejects the backup (`BACKUP_VERSION_MISMATCH`) and never calls `quitAndInstall`. 1.2.1 cannot change already-installed 1.0.2; if Settings still shows that error, run `FMT-Setup.exe` once. After 1.2.1 is installed, later in-app updates validate schema 8 and install silently (`quitAndInstall(true, true)` plus NSIS `--updated` → silent).
- Accounting main page: only the customer list scrolls; currency summary cards stay visible.
- Customer details: transaction column headers stay visible while rows scroll.

---

## [1.2.0] — 2026-08-24 (transaction date/time and module select)

### Added
- Cash In, Cash Out, transfers, and Teller cash movements let the user choose date and time. If both fields are left empty, the current local date and time are applied when the transaction is saved.

### Changed
- Post-login module selection cards are more prominent, with clearer hierarchy, larger icons, and refined hover/press treatment.

---

## [1.1.0] — 2026-08-24 (teller cash management)

### Added
- Teller / Cash Management module inside FMT: module selection after login, switcher between Customer Accounting and Teller without a second login
- Data-driven AFN/USD denominations, Cash In/Out, Head Teller movements, tally, long book, opening/closing balances, reconciliation
- Migration `007_teller.sql` (normalized ledger, inventory, session totals, indexes)
- Automated denomination, cash movement, ledger, company-isolation, and large-history pagination tests

---

## [1.0.2] — 2026-08-24 (in-app GitHub updater)

### Fixed
- Packaged Settings → Check for Updates failed with "Could not check for updates" because electron-updater could not read the GitHub Releases Atom feed. Root cause: `HashmatKhanSediqi/sameer-desktop-app` was not publicly readable (`releases.atom` returned 404 to unauthenticated clients). The public GitHub Releases feed is required; end users must not need `GH_TOKEN`.
- Stopped calling `autoUpdater.setFeedURL()` so packaged builds use electron-builder's generated `resources/app-update.yml`.
- electron-builder GitHub publish config now sets `private: false` / `releaseType: release` explicitly. npm `"private": true` is not GitHub visibility.
- `update-not-available` is mapped to "You are up to date." GitHub/network 404s remain a real error. Underlying updater errors are logged.

### Release artifacts
- `FMT-Setup.exe`, `latest.yml`, `FMT-Setup.exe.blockmap` from the same Windows build

---

## Version Format

```
MAJOR.MINOR.PATCH
```

| Component | When to Increment |
|-----------|-------------------|
| MAJOR | Breaking backup format / schema requiring manual intervention |
| MINOR | New features, backward-compatible schema additions |
| PATCH | Bug fixes, performance, translation corrections |

---

## [1.0.1] — 2026-08-24 (post-v1.0.0 validation fixes)

### Fixed
- Windows desktop/Start Menu shortcut now embeds the official FMT ICO (`afterPack` rcedit onto `FMT.exe`; padded multi-resolution `icon.ico`). Login/source artwork uses padded safe-margin treatment so Windows does not crop the logo.
- Fresh installs initialize an empty accounting database (no demo company/customer/transaction data). Default admin remains `admin` / `admin123`. Existing `%APPDATA%\CustomerAccounting\` data is not wiped on upgrade; if only a legacy `%APPDATA%\FMT` folder exists, that data is kept.
- Currency reactivation is available in Settings. Unused currencies can be deleted. Currencies with historical transactions cannot be hard-deleted (`CURRENCY_IN_USE`); deactivate instead. Last active currency remains protected.
- Settings update status distinguishes up to date, available, checking, downloading, ready, unsupported, and real network failures. "No update available" is no longer shown as an offline error.

---

## [1.0.0] — 2026-08-24 (FMT v1.0.0 — GitHub Release)

### Released
- **FMT v1.0.0** Windows installer (`FMT-Setup.exe`) published on GitHub Releases
- GitHub updater feed: `latest.yml` + blockmap for `electron-updater`
- Full v1.0 feature set: customers, Cash In/Out, transfers, currencies, reports (PDF/Excel), import, backup/restore, EN/Dari/Pashto, security/recovery hardening

### Scale (honest)
- **Empirically validated:** 100,000 customers / 300,000 transactions (automated stress tests)
- **Not empirically validated:** 1,000,000 customers / ~5,000,000 transactions

### Known limitations at release
- Unsigned installer (SmartScreen)
- Unencrypted `.cab` backups
- No clean-VM manual install sign-off in this audit
- Negative cash-out balances allowed (transfers enforce balance)
- Live update install from prior build not manually verified on VM

---

## [1.0.0] — 2026-08-24 (STEP 11 updater architecture)

### Added
- In-app update system via `electron-updater` + GitHub Releases (`HashmatKhanSediqi/sameer-desktop-app`)
- Settings → About update UI (check / download progress / restart & install) in EN / fa-AF / ps
- Validated pre-update `.cab` backup (`FMT_PreUpdate_*` under `backups/pre-update/`) required before install
- Update IPC: `update:getStatus`, `update:check`, `update:download`, `update:install`, `update:status` event
- Unit tests for semver, update state machine, backup-before-install gating, update i18n keys

### Notes
- No GitHub Release was published in this step; end-to-end update install is **not** verified
- Code signing / SmartScreen remains a separate release concern (`signAndEditExecutable: false`)
- Automatic updates are **not** claimed production-ready until a real release is tested

---

## [1.0.0] — 2026-08-23 (Release candidate documentation sync)

### Added
- Official product branding **FMT** (`productName`, shortcuts, `FMT-Setup.exe`, `FMT.exe`, icon)
- Customer list SQL pagination and search for large datasets
- Migration `005_query_indexes.sql` for scale
- Automatic backup on application close (`FMT_AutoClose_*`, retention 10 under `backups/scheduled/`)
- Safety backup retention (`FMT_SafetyBackup_*`, retention 5 under `backups/auto/`)
- Startup `PRAGMA integrity_check` with `DATABASE_CORRUPTED`
- Crash sentinel for unclean shutdown detection
- Transfer balance check inside SQLite transaction (atomic transfer pair)
- Scale stress coverage: 100k customers / 300k transactions (list, search, backup)
- Admin password change and hashed security-question recovery
- Company profile + logo; theme/exchange settings; Decimal exchange calculator
- Atomic customer-to-customer transfers
- Full PDF/Excel report suite with Dari/Pashto RTL pipeline
- Excel import with preview/validation; template `FMT_Import_Template.xlsx`
- Full-system `.cab` backup/restore with pre-login Import Existing System
- Localization: English, Dari (`fa-AF`), Pashto (`ps`)
- Windows NSIS installer via electron-builder

### Security / Integrity
- bcrypt password + recovery answer hashing
- Session idle expiry; sessions cleared on password change and restore
- Backup path-traversal / zip limits / signature / SQLite integrity validation
- Restore requires confirmation; explicit path; validated safety backup first
- Parameterized SQL; Electron contextIsolation / no nodeIntegration

### Known limitations (not fixed in 1.0.0)
- Backups unencrypted
- Pre-login validate/restore without authenticated session (intentional)
- Cash-out/edit may allow negative balances
- Aggregate SQL may `CAST(amount AS REAL)`
- Auto-close backup failure does not block quit
- No dedicated zip-bomb unit test
- No FTS5 search
- Large all-customer reports may use substantial memory
- Code signing not configured
- Clean Windows VM manual install not signed off in this audit
- **1,000,000+ customers not empirically validated**
- In-app update system deferred to v1.1+

### Compatibility identifiers retained
- User data folder `CustomerAccounting`
- `appId` `com.customeraccounting.app`
- npm package name `customer-accounting`

---

## [1.0.0-doc] — 2025-08-21

### Added
- Initial `project-context/` specification package

### Removed
- Audit Log system (explicitly excluded)

---

## [1.1.0] — TBD (Future)

### Planned
- In-app updates (`electron-updater`) with pre-update safety backup
- Optional backup encryption (compatible migration)
- FTS5 customer search
- Authenticode code signing
- Playwright E2E
- Streaming/chunked all-customer reports
- Optional insufficient-balance gate on cash-out/edit (if required)

---

## Backup Format Version History

| format_version | App Version | Changes |
|----------------|-------------|---------|
| 1.0 | 1.0.0+ | Manifest, signature, database, customer + company images; `created_by: FMT` |

---

## Database Schema Version History

| Schema Version | Migration | Changes |
|----------------|-----------|---------|
| 1 | 001_initial | Admin, settings, metadata |
| 2 | 002_customers | Customers + photos |
| 3 | 003_transactions | Currencies + transactions |
| 4 | 004_admin_company_theme_transfers | Recovery, company, transfers, theme/exchange |
| 5 | 005_query_indexes | Scale indexes |

---

## Breaking Change Policy

Breaking changes require MAJOR bump, migration path in `database.md` / `update-system.md`, and changelog **Breaking** label.
