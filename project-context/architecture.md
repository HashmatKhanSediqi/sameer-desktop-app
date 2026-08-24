# Architecture

This document defines the technology stack, module boundaries, and system design for **FMT**.

---

## 1. Technology Stack Selection

### Decision: Electron + React + TypeScript + SQLite

| Criterion | Rationale |
|-----------|-----------|
| **Reliability** | Mature ecosystem; SQLite via `better-sqlite3` is battle-tested for local apps |
| **Maintainability** | TypeScript + React is widely understood by AI agents and developers |
| **Security** | Context isolation, preload scripts, no `nodeIntegration` in renderer |
| **Offline operation** | Fully local; no server dependency |
| **Packaging** | `electron-builder` produces a single Windows NSIS installer |
| **Future updates** | `electron-updater` with code signing support |
| **PDF/Excel/RTL** | Rich JS libraries; HarfBuzz-compatible pipelines via `@react-pdf/renderer` + embedded fonts or server-side PDF generation in main process |
| **Single installer** | Bundles Chromium + Node runtime; customer installs one `.exe` |

### Rejected Alternatives

| Stack | Reason Rejected |
|-------|-----------------|
| MongoDB | Explicitly forbidden; SQLite is required |
| Tauri + Rust | Valid option but smaller AI-agent ecosystem for RTL PDF/Excel edge cases |
| .NET WPF | Valid for Windows-only; less cross-document consistency with web-style i18n/RTL tooling |
| Web app (browser) | Not a desktop app; fails offline-installer requirement |
| Python + PyQt | Requires bundling Python; larger packaging complexity |

### Core Dependencies (Implemented)

**Runtime / Framework**
- Electron 34.x, React 18, TypeScript 5, electron-vite

**Database**
- `better-sqlite3` (main process only)
- Custom migration runner (SQL files `001`–`005`)

**Authentication**
- `bcrypt` (password hashing, main process)

**Money**
- `decimal.js`

**Localization**
- `i18next` + `react-i18next`
- RTL via CSS logical properties + `dir` attribute

**Reports**
- PDF: `pdfkit` + `arabic-persian-reshaper` + `bidi-js` with embedded Inter / Vazirmatn / Noto Naskh Arabic
- Excel: `exceljs`

**Backup**
- Custom `.cab` = ZIP-compatible archive via in-process ZIP writer/reader (path allow-list, bomb limits, CRC). Not shell `archiver` extraction.

**Updates**
- Implemented in v1.0 (`update-system.md`, GitHub Releases via `electron-updater`)

**Installer**
- `electron-builder` NSIS → `FMT-Setup.exe`, productName `FMT`, icon `assets/icons/icon.ico`

**UI**
- Custom CSS design system (green brand tokens); React functional components

---

## 2. Process Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MAIN PROCESS (Node.js)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ SQLite   │ │ Auth     │ │ Backup   │ │ Update        │  │
│  │ Service  │ │ Service  │ │ Service  │ │ Service       │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ Import   │ │ Report   │ │ File     │ │ Migration     │  │
│  │ Service  │ │ Service  │ │ Service  │ │ Runner        │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘  │
│                         IPC (contextBridge)                  │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│              RENDERER PROCESS (React + Chromium)               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ Pages    │ │ UI       │ │ i18n     │ │ Report        │  │
│  │ / Routes │ │ Components│ │ Provider │ │ Preview UI   │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Security Boundary

- **All database access** occurs in the main process.
- **Renderer** communicates via typed IPC channels exposed through `contextBridge` in preload script.
- **No `nodeIntegration`** in renderer.
- **No remote module**.

---

## 3. Module Map

| Module | Location | Responsibility |
|--------|----------|----------------|
| `app-shell` | Main + Renderer | Window lifecycle, routing, app bootstrap |
| `auth` | Main (logic) + Renderer (UI) | Login, session, password verification |
| `customers` | Main + Renderer | Customer CRUD, list, detail |
| `transactions` | Main + Renderer | Cash In/Out, history, pagination |
| `currencies` | Main + Renderer | Currency registry, balance calculations |
| `reports` | Main (generation) + Renderer (UI) | PDF/XLSX report building |
| `import-export` | Main | Excel import validation; export helpers |
| `backup-restore` | Main | Archive create/extract, manifest validation |
| `update` | Main | Version check, download, verify, apply |
| `localization` | Renderer + shared | i18n keys, RTL layout |
| `settings` | Main + Renderer | App settings persistence |
| `database` | Main | SQLite connection, queries, migrations |
| `security` | Main | Hashing, input sanitization, file validation |

### Directory Structure (Target)

```
sameer-desktop-app/          # repository folder (npm name: customer-accounting)
├── package.json             # productName FMT; artifact FMT-Setup.exe
├── src/
│   ├── main/
│   ├── preload/
│   ├── renderer/
│   └── shared/
├── assets/fonts , assets/icons
├── migrations/              # 001–005
├── tests/
├── project-context/
└── dist/FMT-Setup.exe       # build output
```

Compatibility: `appId` `com.customeraccounting.app`; userData folder `CustomerAccounting`.

---

## 4. Data Flow Examples

### Login Flow

```
Renderer: LoginForm → IPC auth:login(username, password)
Main: AuthService.verify → bcrypt.compare → create session token in memory
Main: return { success, sessionId }
Renderer: navigate to CustomerListPage
```

### Add Transaction Flow

```
Renderer: TransactionForm → IPC transactions:create(payload)
Main: validate → BEGIN TRANSACTION → INSERT → COMMIT
Main: recalculate balances (or compute on read — see database.md)
Renderer: refresh customer detail / list
```

### Backup Flow

```
Renderer: BackupButton → IPC backup:create(destinationPath)
Main: BackupService:
  1. WAL checkpoint SQLite
  2. Copy database, settings, images to temp dir
  3. Write manifest.json (version, counts, checksums)
  4. Create .cab archive
  5. Return path + metadata
```

---

## 5. IPC Channel Design

All IPC channels must be typed in `src/shared/types/ipc.ts`.

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `auth:login` | invoke | Authenticate admin |
| `auth:logout` | invoke | End session |
| `auth:checkSession` | invoke | Validate active session |
| `auth:changePassword` | invoke | Change admin password (session required) |
| `auth:setRecovery` | invoke | Set hashed security hint (session required) |
| `auth:recoveryStatus` | invoke | Whether recovery is configured |
| `auth:recoveryPrompt` | invoke | Public recovery question lookup (no leak of which field failed on submit) |
| `auth:recoverPassword` | invoke | Reset password with security answer |
| `company:get` | invoke | Read company profile |
| `company:update` | invoke | Save company profile and logo |
| `company:getLogo` | invoke | Read stored company logo bytes |
| `transfers:create` | invoke | Atomic customer-to-customer transfer |
| `customers:list` | invoke | Paginated customer list with optional accounting enrichment |
| `customers:search` | invoke | Paginated / identity search (SQL LIKE; no FTS5) |
| `customers:get` | invoke | Customer detail + transactions |
| `customers:create` | invoke | Create customer |
| `customers:update` | invoke | Update customer |
| `customers:delete` | invoke | Delete customer (with confirmation in UI) |
| `transactions:create` | invoke | Add transaction |
| `transactions:update` | invoke | Edit transaction |
| `transactions:delete` | invoke | Delete transaction |
| `transactions:list` | invoke | Paginated transaction list |
| `reports:generate` | invoke | Generate PDF or XLSX |
| `import:parse` | invoke | Parse Excel, return preview + errors |
| `import:commit` | invoke | Atomic import commit |
| `backup:create` | invoke | Create backup file |
| `backup:validate` | invoke | Validate backup without restoring |
| `restore:execute` | invoke | Restore from backup (with safety backup) |
| `settings:get` | invoke | Read settings |
| `settings:update` | invoke | Update settings |
| `update:check` | invoke | Check for updates |
| `update:download` | invoke | Download update |
| `app:getPaths` | invoke | User data paths for display |

---

## 6. Application Lifecycle

1. **Startup** — Main process initializes paths, opens SQLite, runs migrations, seeds default admin if missing, creates window.
2. **Pre-login** — Show login OR "Import Existing System" (restore) screen.
3. **Post-login** — If company profile is not configured, show company setup. Then load settings (language, pagination, theme, exchange) and show customer list.
4. **Shutdown** — Auto-close backup (if data exists) → close SQLite (WAL checkpoint) → clear crash sentinel.
5. **Crash recovery** — Crash sentinel warning + integrity_check on open; WAL replay; never auto-destroy DB.

---

## 7. Versioning

- **Semantic versioning**: `MAJOR.MINOR.PATCH`
- Application version stored in:
  - `package.json`
  - SQLite `app_metadata` table
  - Backup manifest
- Schema version stored separately in `schema_migrations` table.

---

## 8. Extensibility Points

| Extension | Mechanism |
|-----------|-----------|
| New currency | Insert into `currencies` table + i18n label; UI reads from registry |
| New language | Add locale JSON file + font configuration |
| New report type | Add report template module; register in ReportsService |
| New setting | Add key to `settings` table with default in migration |
| Schema change | Numbered SQL migration + optional data migration script |

---

## 9. Non-Goals (Architecture Level)

- Microservices
- REST API server for local data
- Real-time multi-device sync
- Plugin marketplace
- Audit log pipeline

---

## 10. Performance Targets

| Operation | Target |
|-----------|--------|
| App cold start | < 5 seconds on typical Windows PC |
| Customer list page @ 100k customers | ~0.5 s (automated) |
| Customer search page @ 100k | ~50 ms (automated) |
| Backup @ 100k / 300k txns | ~2.2 s / ~18 MB (automated) |
| Transaction history page | ~1–2 ms (automated at scale fixture) |

**1,000,000+ customers have not been empirically validated.**

Indexes, SQL aggregation, and pagination must continue to be used — never load full tables into the renderer.
