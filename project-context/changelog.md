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
- Phase 1 application foundation: Electron + React + TypeScript shell
- SQLite connection layer (`better-sqlite3`) with WAL mode and user-data paths
- Secure IPC foundation (`contextBridge`, `nodeIntegration: false`, channel registry)
- Development logging, configuration system, and Phase 1 unit/integration tests
- Architecture updates: `transactions:update`, canonical PDF pipeline, ZIP-compatible `.cab` backups

### Planned
- Application implementation (Electron + React + TypeScript + SQLite)
- Windows installer (`CustomerAccounting-Setup.exe`)
- Full feature set per `requirements.md`

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
| 1 | 1.0.0 | 001_initial | Initial schema: admin, customers, transactions, currencies, settings |

---

## Breaking Change Policy

Breaking changes require:
1. MAJOR version bump
2. Migration path documented in `database.md` and `update-system.md`
3. Backup format backward compatibility or migration tool
4. Entry in this changelog with **Breaking** label
