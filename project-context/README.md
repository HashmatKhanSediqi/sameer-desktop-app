# FMT — Project Context

This folder is the authoritative specification and maintenance context for **FMT**, a professional offline desktop customer accounting application for Windows.

Documentation must describe the **current implementation**, not historical product names or unfinished plans.

## Product Identity

| Attribute | Value |
|-----------|-------|
| Official product name | **FMT** |
| Installer artifact | `FMT-Setup.exe` |
| Application executable | `FMT.exe` |
| Desktop / Start Menu shortcut | **FMT** |
| Application version | `1.0.1` |
| Backup extension | `.cab` (ZIP-compatible) |
| Default backup filename | `FMT_Backup_YYYY-MM-DD.cab` |
| Import template | `FMT_Import_Template.xlsx` |
| Report filenames | `FMT_{ReportType}_...pdf\|xlsx` |

### Intentional compatibility identifiers (do not rename casually)

These remain for **backward compatibility** with existing user data and Electron/app identity. They are **not** user-facing product branding:

| Identifier | Why it remains |
|------------|----------------|
| `%APPDATA%\CustomerAccounting\` | Existing installed databases, images, backups, and logs live here |
| `%LOCALAPPDATA%\Programs\CustomerAccounting\` | Default electron-builder install directory for upgrades |
| `com.customeraccounting.app` | Windows App User Model ID / electron-builder `appId` |
| npm package name `customer-accounting` | Internal package identity; not shown to end users |
| TypeScript name `CustomerAccountingStats` | Internal code symbol |

**Do not reintroduce** “Customer Accounting” / “CustomerAccounting” as user-facing product names in UI, installer shortcuts, or documentation titles.

---

## What FMT Is

A single-user, offline-first desktop application that lets an administrator:

- Manage customers with multi-currency balances (AFN, USD, EUR + Settings-extensible)
- Record Cash In, Cash Out, and customer-to-customer transfers
- Paginate and search large customer lists (SQL-side; stress-tested at 100k customers / 300k transactions)
- Generate PDF and Excel reports (including RTL Dari and Pashto)
- Import data from Excel with validation and preview
- Create full-system backups (manual + automatic on application close)
- Restore backups on new or existing installations (including pre-login restore)
- Change admin password and use hashed security-question recovery

The end customer receives **one installer file** (`FMT-Setup.exe`) and uses the application immediately — no Node.js, MongoDB, Python, npm, Git, or command-line tools required.

## What FMT Is Not

- Not a web application
- Not a cloud/SaaS product (data stays local)
- Not a multi-user server application
- Not using MongoDB
- **Does not include an Audit Log** (explicitly removed from scope)
- Does **not** require internet for daily accounting; updates use GitHub Releases when the user checks for them

## Document Index

| # | File | Purpose | Status |
|---|------|---------|--------|
| 1 | [AI_INSTRUCTIONS.md](./AI_INSTRUCTIONS.md) | Mandatory rules for AI coding agents | CURRENT |
| 2 | [requirements.md](./requirements.md) | Functional and non-functional requirements | CURRENT |
| 3 | [architecture.md](./architecture.md) | Technology stack, modules, and system design | CURRENT |
| 4 | [database.md](./database.md) | SQLite schema, migrations, and data rules | CURRENT |
| 5 | [authentication.md](./authentication.md) | Admin login, sessions, and credential handling | CURRENT |
| 6 | [ui-ux.md](./ui-ux.md) | Visual design, layout, and interaction patterns | CURRENT |
| 7 | [customers.md](./customers.md) | Customer CRUD, list pagination, search | CURRENT |
| 8 | [transactions.md](./transactions.md) | Cash In/Out, transfers, pagination | CURRENT |
| 9 | [currencies.md](./currencies.md) | Multi-currency rules and extensibility | CURRENT |
| 10 | [reports.md](./reports.md) | PDF/Excel generation, RTL, report types | CURRENT |
| 11 | [import-export.md](./import-export.md) | Excel import format, validation, and export | CURRENT |
| 12 | [backup-restore.md](./backup-restore.md) | Backup format, auto-close, restore, retention | CURRENT |
| 13 | [update-system.md](./update-system.md) | GitHub Releases in-app update system | CURRENT |
| 14 | [localization.md](./localization.md) | Dari, Pashto, English; RTL/LTR | CURRENT |
| 15 | [security.md](./security.md) | Hashing, validation, known risks | CURRENT |
| 16 | [desktop-app.md](./desktop-app.md) | Lifecycle, directories, logs, crash recovery | CURRENT |
| 17 | [installer.md](./installer.md) | Windows installer and uninstall behavior | CURRENT |
| 18 | [coding-rules.md](./coding-rules.md) | Code style, structure, and conventions | CURRENT |
| 19 | [testing.md](./testing.md) | Test strategy and acceptance criteria | CURRENT |
| 20 | [changelog.md](./changelog.md) | Versioning and release history | CURRENT |
| 21 | [release-readiness.md](./release-readiness.md) | v1.0 release assessment and known risks | RELEASE-RELEVANT |

## Implementation Status (v1.0)

Core v1.0 scope is **implemented**. See [release-readiness.md](./release-readiness.md) for the honest VERIFIED / LIMITATION / BLOCKER matrix.

### Empirically validated scale

| Dataset | Status |
|---------|--------|
| 100,000 customers / 300,000 transactions | **Empirically validated** (default CI stress tests) |
| 1,000,000 customers / ~5,000,000 transactions | See `release-readiness.md` / STEP 10 report — run via `npm run test:extreme` |

**Do not claim 1M/5M support unless `npm run test:extreme` completed successfully on the target machine.**

Architecture (SQL-side pagination, aggregation indexes, no full-table load into the renderer for lists) is designed to scale further. Remaining bottlenecks include:

- Customer search still uses SQL `LIKE '%term%'` for name/partial matches (exact `C-####` numbers use indexed equality)
- FTS5 was **not** added — only implement after extreme benchmarks prove LIKE is inadequate for the required UX
- Full all-customer PDF/Excel still materializes every customer row in JS (chunked SQL reads; O(N) memory for the final model)
- Backup time/size growth with DB size

Migration `006_customer_number_nocase.sql` adds a case-insensitive index for exact customer-number search.

## Key Defaults (Do Not Change Without Explicit Instruction)

| Item | Value |
|------|-------|
| Default admin username | `admin` |
| Default admin password | `admin123` |
| Database | SQLite (local file) |
| Initial currencies | AFN, USD, EUR |
| Supported languages | English (LTR), Dari (RTL), Pashto (RTL) |
| Installer name | `FMT-Setup.exe` |
| Backup extension | `.cab` |

## Assumptions

1. **Single administrator** — One admin account with full access; no role-based access control in v1.0.
2. **Single computer** — One SQLite database on one machine; no sync between devices.
3. **Windows 10/11 x64** — Primary target platform for v1.0.
4. **Internet optional** — Not required for daily use. Update check/download requires internet when the user chooses to update.
5. **Customer profile photos** — Stored as local image files referenced by database; included in backups.
6. **Timestamps** — Transaction dates stored as local wall-clock `TEXT`; displayed with locale-appropriate formatting and Latin digits.
7. **Amount precision** — Monetary amounts stored as decimal `TEXT` strings; business logic uses `decimal.js`. Aggregation SQL may use `CAST(amount AS REAL)` — see known risks in `security.md` / `release-readiness.md`.

## Cross-Reference Map

```
requirements.md ──► architecture.md ──► database.md
        │                  │
        ▼                  ▼
   ui-ux.md          desktop-app.md
        │                  │
        ├─ customers.md    ├─ installer.md
        ├─ transactions.md ├─ backup-restore.md
        ├─ currencies.md   ├─ update-system.md
        ├─ reports.md      └─ security.md
        ├─ import-export.md
        └─ localization.md
                 │
                 ▼
         release-readiness.md
```

## Version

Documentation package version: **1.0.1** (synchronized with FMT v1.0.1).
