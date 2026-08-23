# Changelog

All notable changes to **FMT** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
