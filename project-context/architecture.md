# Architecture

This document defines the technology stack, module boundaries, and system design for the Customer Accounting desktop application.

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

### Core Dependencies (Document Only — Do Not Install Yet)

**Runtime / Framework**
- Electron (latest stable LTS-compatible)
- React 18+
- TypeScript 5+

**Database**
- `better-sqlite3` (main process only)
- Custom migration runner (SQL files, versioned)

**Authentication**
- `bcrypt` (password hashing, main process)

**Localization**
- `i18next` + `react-i18next`
- RTL via CSS logical properties + `dir` attribute

**Reports**
- PDF (canonical): `pdfkit` + `arabic-persian-reshaper` + `bidi-js` in main process with embedded Noto Naskh Arabic / Vazirmatn / Noto Sans fonts
- Excel: `exceljs` (read/write XLSX)

**Import**
- `exceljs` for parsing import files

**Backup**
- Custom `.cab` archive: ZIP-compatible format via `archiver` (`.cab` extension); manifest JSON + SQLite + assets

**Updates**
- `electron-updater` + code-signed releases on update server

**Installer**
- `electron-builder` with NSIS target

**UI**
- Component library: shadcn/ui or similar (Tailwind-based) for professional modern look
- State: Zustand or React Context for app state; React Query optional for cache patterns

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
customer-accounting/
├── package.json
├── electron-builder.yml
├── src/
│   ├── main/                 # Electron main process
│   │   ├── index.ts
│   │   ├── ipc/              # IPC handlers
│   │   ├── services/         # Business logic services
│   │   ├── database/         # SQLite, migrations
│   │   └── utils/
│   ├── preload/
│   │   └── index.ts          # contextBridge API
│   ├── renderer/             # React app
│   │   ├── App.tsx
│   │   ├── pages/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── i18n/
│   │   └── styles/
│   └── shared/               # Types shared main/renderer
│       └── types/
├── assets/
│   ├── fonts/                # Noto Naskh Arabic, etc.
│   └── icons/
├── migrations/               # SQL migration files
└── project-context/          # This documentation
```

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
| `customers:list` | invoke | List all customers with balances |
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
3. **Post-login** — Load settings (language, pagination), show customer list.
4. **Shutdown** — Close SQLite cleanly; flush WAL.
5. **Crash recovery** — SQLite WAL replay on next startup; log crash to log file.

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
| Customer list load (1000 customers) | < 1 second |
| Transaction list page | < 500 ms |
| PDF report (1000 rows) | < 10 seconds |
| Backup (10 MB data) | < 5 seconds |

Indexes and pagination must be used to meet these targets.
