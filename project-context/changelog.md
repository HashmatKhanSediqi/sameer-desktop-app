# Changelog

All notable changes to the Customer Accounting project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## Version Format

```
MAJOR.MINOR.PATCH
```

| Component | When to Increment |
|-----------|-------------------|
| MAJOR | Breaking changes to backup format, database schema requiring manual intervention, or incompatible API changes |
| MINOR | New features, new currencies, new report types, backward-compatible schema additions |
| PATCH | Bug fixes, performance improvements, translation corrections |

### Examples

- `1.0.0` — Initial public release
- `1.1.0` — Added in-app update system
- `1.1.1` — Fixed Dari PDF rendering bug

---

## Release Stages

| Stage | Description |
|-------|-------------|
| Documentation | Project specification and context files (no application code) |
| Alpha | Core features implemented, internal testing |
| Beta | Feature complete, VM and user acceptance testing |
| Release | Production installer distributed |

---

## [Unreleased]

### Added
- Admin password change and hashed security-hint recovery (`auth:changePassword`, `auth:setRecovery`, `auth:recoveryPrompt`, `auth:recoverPassword`)
- First-time company setup plus Settings company profile and local logo storage (`company:get` / `company:update` / `company:getLogo`)
- Persistent theme and main-page card colors via CSS variables; exchange calculator toggle (default off)
- Offline Decimal.js currency exchange calculator on the main page
- Atomic customer-to-customer transfers as paired Cash Out / Cash In ledger rows (`transfers:create`)
- Company name/logo/contact header on every PDF and Excel report; transfer in/out labels
- Migration `004_admin_company_theme_transfers.sql` (recovery columns, `company_profile`, transfer columns, theme/exchange settings)

### Changed
- PDF renderer implements fontkit 2.0.4’s missing OpenType NULL-anchor handling on GPOS `applyAnchor` (Noto MarkToBase/MarkToMark). Intended to stop the `getAnchor` / `REPORT_WRITE_FAILED` crash while keeping logical-Unicode whole-run shaping. Confirm with `npm test` and a real Dari/Pashto customer export before treating as released
- Customer PDF inspector now decodes Identity-H text with the active font ToUnicode map so mixed Dari/Pashto reports keep AFN/USD/EUR and Pashto letters such as ې
- `fonts:fetch` refuses a Noto Naskh Arabic TTF that is smaller than 250 KB or missing U+06D0 (`ې`)
- Long PDF notes paginate with one non-reentrant page break: measure the row, start a new page if needed, then draw — no nested addPage while a row is being painted
- Customer/accounting PDFs are table-based documents: header, customer information, per-currency balances, transaction summary, history (date + time), and period totals
- PDF RTL pipeline: Noto Naskh Arabic + Inter; shape Arabic runs only; PDFKit draws OT-shaped Arabic glyphs after bidi run/glyph reorder; long notes wrap inside cells; every table has vertical column rules
- Login page visual refinement: elevated card, quiet background depth, dimensional primary button, green/white brand tokens
- Customer list currency totals restyled as soft raised summary cards using `--summary-tone-*` CSS variables (ready for a later Settings color picker)
- Customer list balances: positive green, negative red, zero default — display only
- Removed Cash In / Cash Out count columns from the customer list table; counts remain on customer detail, transactions, and reports
- Customer details: information card sits at inline-start (left in English, right in Dari/Pashto); a single Add Transaction button; currency cards use the same elevated summary-card treatment
- Application-wide responsive layout: wrapping header/actions, flexible forms, stacked table cards in narrow panels, wider customer information card (~38% of the detail row)
- Customer details desktop: viewport-locked page; only Transaction History scrolls
- Customer details scroll correction: history pane is the only overflow-y scroller; profile and currency cards stay outside it
- Add/Edit Transaction modal restyled to the app design system (segmented type control, prominent amount field, sticky footer)
- New transactions stamp the current local date and time; the Add Transaction form no longer asks for date/time
- Transaction history, delete confirmation, and reports show locale-formatted date and time

### Added
- Customer Details **Export PDF** action using existing `reports:generate` (current language/RTL, separate AFN/USD/EUR, works with zero transactions)
- Amount field in Add/Edit Transaction accepts English/Latin digits `0-9` and the decimal point only; Dari/Persian/Arabic numerals and letters are blocked on input/paste
- Reports: PDF and Excel generation in the main process (`reports:generate`) for individual customer, all customers, date range, transactions, and currency summary
- Report UI with type, customer, date range, and PDF/Excel format selection; native save dialog after generation
- RTL PDF pipeline using `pdfkit` + `arabic-persian-reshaper` + `bidi-js` with embedded Inter / Vazirmatn / Noto Naskh Arabic TTF fonts
- Excel reports via `exceljs` with frozen headers, note wrapping, Cash In green / Cash Out red, and `rightToLeft` sheets for Dari and Pashto
- Localization: English, Dari (`fa-AF`), and Pashto (`ps`) with i18next namespaces
- Language selector on login and the authenticated shell; persisted in `settings.language`
- RTL layout for Dari/Pashto and LTR for English (`dir`/`lang` on the document root)
- Bundled font architecture (Inter, Vazirmatn, Noto Naskh Arabic) with CSS logical properties
- Locale-aware money/date formatting using Latin digits and LTR amount isolation
- Translation namespaces prepared for Settings, Reports, Import, Backup, and shared errors
- Settings screen: language, pagination, currency add/deactivate, account username, about/paths
- `currencies:create` and `currencies:deactivate` IPC for Settings currency registry
- Phase 4 transactions: Cash In / Cash Out, per-currency balances computed on read, edit/delete, notes
- Migration `003_transactions.sql` (currencies registry + transactions with ON DELETE CASCADE)
- Excel import: `import:parse` preview/validation and atomic `import:commit` for Customers + Transactions sheets
- Import UI with file selection, preview, validation errors, confirmation, and localized EN/Dari/Pashto copy
- Import template download (`import:downloadTemplate` → `CustomerAccounting_Import_Template.xlsx`)
- Import security checks: XLSX/ZIP magic bytes, 50 MB size limit, 100k row limit, path-traversal rejection, formula results only (no VBA/macro execution)
- Full-system ZIP-compatible `.cab` backup/restore (`backup:create`, `backup:validate`, `restore:execute`)
- Pre-login "Import Existing System" restore with validation preview, confirmation, and safety backup
- Backup security: path-traversal rejection, checksum/signature verification, zip-bomb limits, SQLite magic + integrity checks, atomic swap with rollback
- Backup includes SQLite database, customer photos, manifest metadata, and SHA-256 signature
- Settings Backup/Restore UI and localized EN/Dari/Pashto backup copy

### Notes
- `architecture.md` names `archiver` for `.cab` ZIP streams. Backup/restore uses an in-process ZIP writer/reader so path-traversal, zip-bomb, allow-list, and CRC checks run before any file is inflated or written. The `.cab` file remains a standard ZIP.
- Phase 3 customer management: schema, repository, service, authenticated IPC, list/create/edit/detail/search UI
- Migration `002_customers.sql` (optional name, customer number, profile photo; hard delete)
- Customer profile photo storage under user-data `data/images/customers/` with magic-byte validation
- Phase 2 authentication: login, logout, in-memory sessions, bcrypt admin storage
- Migration `001_initial.sql` and migration runner (required for admin_users table)
- Default admin seed (`admin` / `admin123`)
- Login UI with i18next scaffold (English auth/common namespaces)
- Auth IPC handlers and protected app IPC channels
- SQLite connection layer (`better-sqlite3`) with WAL mode and user-data paths
- Secure IPC foundation (`contextBridge`, `nodeIntegration: false`, channel registry)
- Development logging, configuration system, and Phase 1 unit/integration tests
- Architecture updates: `transactions:update`, canonical PDF pipeline, ZIP-compatible `.cab` backups

### Planned
- Windows installer (`CustomerAccounting-Setup.exe`) delivery and VM testing
- Comprehensive UI/UX review and correction pass
- Playwright E2E coverage
- In-app update system (v1.1)

Password change remains a later-version feature.

---

## [1.0.0-doc] — 2025-08-21

### Added
- Complete `project-context/` documentation package (21 files)
- Architecture specification: Electron + React + TypeScript + SQLite
- Database schema design with migration strategy
- Authentication specification (default admin: admin/admin123)
- Customer, transaction, and multi-currency requirements
- PDF/Excel report specification with RTL Dari/Pashto requirements
- Excel import format and validation pipeline
- Full system backup/restore architecture (`.cab` format)
- Update system architecture with data preservation rules
- Localization specification (English, Dari, Pashto)
- Security specification
- Desktop application lifecycle and directory structure
- Windows NSIS installer specification
- Coding rules for AI and human developers
- Comprehensive testing strategy
- AI development instructions

### Removed
- Audit Log system (explicitly excluded from scope)

### Documentation Notes
- This release contains **specification only** — no application source code
- MongoDB explicitly excluded; SQLite required
- Application files and user data separation documented as mandatory

---

## [1.0.0] — TBD (Application Release)

### Planned Added
- Admin login with default credentials
- Customer list as main page with AFN/USD/EUR totals
- Customer CRUD with optional profile photo
- Cash In (green) / Cash Out (red) transactions
- Customer detail with per-currency summaries
- Transaction pagination (configurable in Settings)
- PDF and Excel reports (EN, Dari, Pashto)
- Excel import with preview and validation
- Full system backup and pre-login restore
- Localization: English (LTR), Dari (RTL), Pashto (RTL)
- Windows installer with Desktop and Start Menu shortcuts

### Planned Security
- bcrypt password hashing
- Session-based authentication
- Input and file validation

---

## [1.1.0] — TBD (Future)

### Planned Added
- In-app update check and install (electron-updater)
- Pre-update automatic safety backup
- Settings: change admin password
- Settings: add new currencies via UI
- Optional scheduled automatic backups

---

## [1.1.1] — TBD (Future)

### Planned Fixed
- (Patch releases document specific bug fixes here)

---

## How to Update This File

When implementing features, the AI coding agent must:

1. Add entries under `[Unreleased]` as work progresses
2. Move `[Unreleased]` items to a versioned section on release
3. Include date in `YYYY-MM-DD` format on release
4. Categorize changes: Added, Changed, Deprecated, Removed, Fixed, Security
5. Reference related `project-context/` doc updates if behavior changed

### Entry Template

```markdown
## [X.Y.Z] — YYYY-MM-DD

### Added
- Feature description (#issue if applicable)

### Changed
- What changed and why

### Fixed
- Bug description and impact

### Security
- Security-related changes
```

---

## Backup Format Version History

| format_version | App Version | Changes |
|----------------|-------------|---------|
| 1.0 | 1.0.0+ | Initial backup format with manifest.json, database, images |

---

## Database Schema Version History

| Schema Version | App Version | Migration | Changes |
|----------------|-------------|-----------|---------|
| 1 | 1.0.0 | 001_initial | Initial schema: admin, settings, metadata (Phase 2) |
| 2 | 1.0.0 | 002_customers | Customer table with name, number, profile photo (Phase 3) |
| 3 | 1.0.0 | 003_transactions | Currencies registry and transactions (Phase 4) |

---

## Breaking Change Policy

Breaking changes require:
1. MAJOR version bump
2. Migration path documented in `database.md` and `update-system.md`
3. Backup format backward compatibility or migration tool
4. Entry in this changelog with **Breaking** label
