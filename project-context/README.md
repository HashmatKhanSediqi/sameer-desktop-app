# Customer Accounting — Project Context

This folder contains the complete specification for building a **professional offline desktop customer accounting application** for Windows. It is intended to be read by AI coding agents and human developers before writing any application code.

## What This Project Is

A single-user, offline-first desktop application that lets an administrator:

- Manage customers with multi-currency balances (AFN, USD, EUR)
- Record Cash In and Cash Out transactions
- Generate PDF and Excel reports (including RTL Dari and Pashto)
- Import data from Excel with validation and preview
- Create full system backups and restore them on new installations
- Receive application updates without losing local data

The end customer receives **one installer file** (e.g. `CustomerAccounting-Setup.exe`) and uses the application immediately — no Node.js, MongoDB, Python, npm, Git, or command-line tools required.

## What This Project Is Not

- Not a web application
- Not a cloud/SaaS product (data stays local)
- Not a multi-user server application
- Not using MongoDB
- **Does not include an Audit Log** (explicitly removed from scope)

## Document Index

Read documents in the order below when starting implementation.

| # | File | Purpose |
|---|------|---------|
| 1 | [AI_INSTRUCTIONS.md](./AI_INSTRUCTIONS.md) | Mandatory rules for AI coding agents |
| 2 | [requirements.md](./requirements.md) | Functional and non-functional requirements |
| 3 | [architecture.md](./architecture.md) | Technology stack, modules, and system design |
| 4 | [database.md](./database.md) | SQLite schema, migrations, and data rules |
| 5 | [authentication.md](./authentication.md) | Admin login, sessions, and credential handling |
| 6 | [ui-ux.md](./ui-ux.md) | Visual design, layout, and interaction patterns |
| 7 | [customers.md](./customers.md) | Customer CRUD and list behavior |
| 8 | [transactions.md](./transactions.md) | Cash In/Out, pagination, and calculations |
| 9 | [currencies.md](./currencies.md) | Multi-currency rules and extensibility |
| 10 | [reports.md](./reports.md) | PDF/Excel generation, RTL, and report types |
| 11 | [import-export.md](./import-export.md) | Excel import format, validation, and export |
| 12 | [backup-restore.md](./backup-restore.md) | Backup format, restore flow, and safety |
| 13 | [update-system.md](./update-system.md) | Online update architecture and data preservation |
| 14 | [localization.md](./localization.md) | Dari, Pashto, English; RTL/LTR |
| 15 | [security.md](./security.md) | Hashing, validation, and threat mitigation |
| 16 | [desktop-app.md](./desktop-app.md) | Lifecycle, directories, logs, crash recovery |
| 17 | [installer.md](./installer.md) | Windows installer and uninstall behavior |
| 18 | [coding-rules.md](./coding-rules.md) | Code style, structure, and conventions |
| 19 | [testing.md](./testing.md) | Test strategy and acceptance criteria |
| 20 | [changelog.md](./changelog.md) | Versioning format and release history |

## Recommended Implementation Order

1. **Foundation** — Project scaffold, architecture modules, SQLite, migrations
2. **Authentication** — Login screen, session, default admin account
3. **Localization** — i18n system with EN / Dari / Pashto and RTL layout
4. **Customers** — Main page customer list, CRUD, profile photos
5. **Transactions** — Cash In/Out, balances, pagination setting
6. **Reports** — PDF and Excel with proper RTL rendering
7. **Import/Export** — Excel import with preview; export utilities
8. **Backup/Restore** — Full system backup; pre-login restore flow
9. **Settings** — Admin extensibility, pagination toggle, future currencies
10. **Update system** — Version check, download, verify, install (can ship in v1.1+)
11. **Installer** — NSIS/electron-builder packaging, shortcuts, data separation
12. **Testing** — Full test pass per `testing.md`

## Key Defaults (Do Not Change Without Explicit Instruction)

| Item | Value |
|------|-------|
| Default admin username | `admin` |
| Default admin password | `admin123` |
| Database | SQLite (local file) |
| Initial currencies | AFN, USD, EUR |
| Supported languages | English (LTR), Dari (RTL), Pashto (RTL) |
| Installer name | `CustomerAccounting-Setup.exe` |
| Backup extension | `.cab` (custom archive format) |

## Assumptions

1. **Single administrator** — One admin account with full access; no role-based access control in v1.0.
2. **Single computer** — One SQLite database on one machine; no sync between devices.
3. **Windows 10/11 x64** — Primary target platform for v1.0.
4. **Internet optional** — Required only for checking/downloading application updates, not for daily use.
5. **Customer profile photos** — Stored as local image files referenced by database; included in backups.
6. **Timestamps** — All transaction dates stored in UTC; displayed in local timezone with locale-appropriate formatting.
7. **Amount precision** — Monetary amounts stored as integers in minor units OR as DECIMAL(18,4); see `database.md` for the canonical choice (DECIMAL recommended for accounting clarity).

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
```

## Version

Documentation package version: **1.0.0** (specification only — no application code yet).
