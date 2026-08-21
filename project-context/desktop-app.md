# Desktop Application

Application lifecycle, directory structure, logging, and crash recovery.

---

## 1. Overview

Customer Accounting behaves as a **native Windows desktop application**:

- Launches from Desktop or Start Menu shortcut
- Single main window (multi-window optional for dialogs)
- No terminal, command line, or environment variables required by user
- Fully offline during normal operation

---

## 2. Application Lifecycle

```
┌─────────────┐
│ App Start   │
└──────┬──────┘
       ▼
┌─────────────┐
│ Init paths  │  Create user data dirs if missing
└──────┬──────┘
       ▼
┌─────────────┐
│ Open SQLite │  WAL mode, foreign keys ON
└──────┬──────┘
       ▼
┌─────────────┐
│ Migrations  │  Apply pending schema migrations
└──────┬──────┘
       ▼
┌─────────────┐
│ Seed data   │  Default admin, currencies, settings if empty
└──────┬──────┘
       ▼
┌─────────────┐
│ Create window│  Show login or restore screen
└──────┬──────┘
       ▼
┌─────────────┐
│ Running     │  User interaction via IPC
└──────┬──────┘
       ▼
┌─────────────┐
│ App Quit    │  Close DB, flush logs, WAL checkpoint
└─────────────┘
```

### Single Instance (Recommended)

- Only one app instance per user session
- Second launch focuses existing window

---

## 3. Directory Structure

### Application Files (Updated on Install/Update)

```
C:\Users\{username}\AppData\Local\Programs\CustomerAccounting\
├── CustomerAccounting.exe
├── resources/
│   ├── app.asar
│   └── assets/
├── locales/
└── (Electron runtime files)
```

**Never store user data here.**

### User Data (Preserved Forever)

```
C:\Users\{username}\AppData\Roaming\CustomerAccounting\
├── data/
│   ├── accounting.db          # SQLite database
│   ├── accounting.db-wal      # WAL file (if exists)
│   ├── accounting.db-shm      # Shared memory (if exists)
│   └── images/
│       └── customers/
│           ├── 1.jpg
│           └── 2.png
├── backups/
│   ├── auto/                  # Safety backups
│   ├── pre-update/            # Pre-update backups
│   └── scheduled/             # Future auto backups
├── logs/
│   ├── app.log                # Current log
│   └── app.log.1              # Rotated logs
├── cache/
│   └── (temp report files, cleared periodically)
└── config/
    └── (optional local config overrides)
```

### Path Resolution

Use Electron `app.getPath('userData')` → `%APPDATA%/CustomerAccounting`

Document path in Settings → About for user reference (read-only, copy button).

---

## 4. Configuration

| Config | Storage | Notes |
|--------|---------|-------|
| User settings | SQLite `settings` table | Language, pagination, etc. |
| App metadata | SQLite `app_metadata` | Version, install date |
| Environment variables | **Not used for user config** | Dev only |

Users must never need to set environment variables.

---

## 5. Logging

### Log Location

`%APPDATA%/CustomerAccounting/logs/app.log`

### Log Levels

| Level | Usage |
|-------|-------|
| ERROR | Failures requiring attention |
| WARN | Recoverable issues |
| INFO | Startup, backup, restore, update events |
| DEBUG | Development only |

### Rotation

- Max file size: 5 MB
- Keep 5 rotated files
- Never log passwords or sensitive data

### Example Entries

```
2025-08-21T10:00:00.000Z INFO  App started v1.0.0
2025-08-21T10:00:01.000Z INFO  Database opened: .../accounting.db
2025-08-21T10:05:00.000Z INFO  Backup created: .../CustomerAccounting_Backup_2025-08-21.cab
2025-08-21T10:10:00.000Z ERROR Import failed: INVALID_CURRENCY row 15
```

---

## 6. Database Location

**Path:** `%APPDATA%/CustomerAccounting/data/accounting.db`

### Startup Checks

1. Directory exists — create if not
2. Database exists — create with migrations if not
3. WAL checkpoint on clean shutdown
4. `PRAGMA integrity_check` on startup after crash (optional, log result)

---

## 7. Update Location

Downloaded update installers:

`%APPDATA%/CustomerAccounting/cache/updates/`

Clean up after successful install.

---

## 8. Backup Location

| Type | Default Path |
|------|--------------|
| User-initiated | User-chosen via save dialog |
| Safety (auto) | `%APPDATA%/CustomerAccounting/backups/auto/` |
| Pre-update | `%APPDATA%/CustomerAccounting/backups/pre-update/` |

---

## 9. Crash Recovery

### SQLite WAL Recovery

If app crashes mid-write:
- WAL file replayed automatically on next SQLite open
- No user action required

### Crash Detection

On startup, check for sentinel file `.crash` created at launch, removed on clean quit.

If sentinel exists from previous run → log "Possible unclean shutdown" → run integrity check.

### Recovery UI

If integrity check fails:
- Show dialog: "Database may be damaged. Restore from backup?"
- Options: Restore from backup, Open backup folder, Contact support info

---

## 10. Window Management

| Property | Value |
|----------|-------|
| Default size | 1280 × 800 |
| Minimum size | 1024 × 600 |
| Title | Localized app name |
| Icon | Application icon in taskbar |
| Menu bar | Hidden or minimal (File, Settings, Help) |

---

## 11. System Integration

| Feature | Implementation |
|---------|----------------|
| Desktop shortcut | Created by installer |
| Start Menu | Created by installer |
| File associations | `.cab` optional — "Customer Accounting Backup" |
| Auto-start | Not enabled by default |

---

## 12. Offline Operation

All core features work without network:

- Login
- Customer/transaction CRUD
- Reports
- Import (local file)
- Backup (local file)
- Restore

Network used only for optional update check/download.

---

## 13. Temporary Files

| Purpose | Location | Cleanup |
|---------|----------|---------|
| Report generation | `cache/reports/` | Delete after save or on startup |
| Backup staging | OS temp dir | Delete after backup complete |
| Import parsing | Memory / temp | GC after parse |

---

## 14. Application Metadata

Stored in `app_metadata` table:

| Key | Example |
|-----|---------|
| `app_version` | `1.0.0` |
| `installed_at` | `2025-08-21T10:00:00Z` |
| `last_backup_at` | `2025-08-21T15:00:00Z` |
| `last_update_check` | `2025-08-21T12:00:00Z` |

---

## 15. IPC: Path Information

### `app:getPaths`

**Output:**
```typescript
{
  userData: string;
  database: string;
  images: string;
  logs: string;
  backups: string;
}
```

Displayed in Settings → About for troubleshooting.

---

## 16. Development vs Production

| Aspect | Development | Production |
|--------|-------------|------------|
| DevTools | Open | Closed |
| Log level | DEBUG | INFO |
| User data path | Same structure | Same structure |
| Hot reload | Vite/electron-vite | N/A |

Production build must not include dev dependencies.

---

## 17. Uninstall Behavior

See `installer.md` — uninstall removes application files only; user data preserved by default.

---

## 18. Platform Support

| Platform | v1.0 |
|----------|------|
| Windows 10 x64 | Supported |
| Windows 11 x64 | Supported |
| macOS | Future |
| Linux | Future |

Architecture should not prevent future ports (Electron cross-platform).
