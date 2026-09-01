# Desktop Application

Application lifecycle, directory structure, logging, and crash recovery for **FMT**.

---

## 1. Overview

FMT behaves as a **native Windows desktop application**:

- Launches from Desktop or Start Menu shortcut named **FMT**
- Executable: `FMT.exe`
- Single main window
- No terminal or developer tools required by the end user
- Fully offline during normal operation

---

## 2. Application Lifecycle

```
App Start
  → Init paths / ensure user-data directories
  → Detect unclean shutdown (crash sentinel) → warn
  → Set crash sentinel
  → Open SQLite (WAL, FK, busy_timeout, synchronous NORMAL)
  → PRAGMA integrity_check (fail closed if corrupted)
  → Run migrations 001–005
  → Seed default admin if empty
  → Create window (login / Import Existing System)
  → Running (IPC)
  → before-quit: automatic backup to the user-configured folder (timeout 120s) then close DB, clear sentinel, quit
```

### Single Instance

- `requestSingleInstanceLock()` — second launch focuses existing window

### Quit Behavior

- `QuitBackupCoordinator` single-flight guard prevents conflicting shutdown operations
- Automatic backup runs **before** database shutdown while DB is still open, into the user-configured folder
- Backup failure / timeout does **not** block quit and does **not** corrupt the database
- Later quit events while a backup is running are blocked until the attempt finishes (no duplicate backups, no early exit)

---

## 3. Directory Structure

### Application Files

```
%LOCALAPPDATA%\Programs\CustomerAccounting\
├── FMT.exe
├── resources\
│   ├── app.asar
│   ├── migrations\
│   ├── fonts\
│   └── icon.ico
└── (Electron runtime)
```

Folder name `CustomerAccounting` is an intentional compatibility identifier.

### User Data

```
%APPDATA%\CustomerAccounting\
├── data\
│   ├── accounting.db
│   ├── accounting.db-wal / .db-shm (as present)
│   └── images\
│       ├── customers\
│       └── company\
├── backups\
│   ├── auto\          # FMT_SafetyBackup_* (retention 5)
│   ├── scheduled\     # legacy FMT_AutoClose_* copies (no longer written)
│   └── pre-update\    # validated .cab before in-app update install (retention 5)
├── logs\
├── cache\
└── .crash             # unclean-shutdown sentinel (implementation detail)
```

Resolve via Electron `app.getPath('userData')` with app name `CustomerAccounting` for path stability.

---

## 4. Logging

Path: `%APPDATA%/CustomerAccounting/logs/`

Never log passwords, hashes, session IDs, or recovery answers.

---

## 5. Crash Recovery

| Mechanism | Behavior |
|-----------|----------|
| SQLite WAL | Incomplete transactions roll back on reopen |
| Crash sentinel | Warns if previous run did not clear sentinel |
| Integrity check | On every connect; throws `DATABASE_CORRUPTED` if not `ok` |
| Auto overwrite | **Forbidden** |
| User recovery | Pre-login Import Existing System / Settings restore |

There is no dedicated corruption recovery wizard beyond fail-closed startup + restore flow.

---

## 6. Performance Notes

| Operation | Observed / target |
|-----------|-------------------|
| Customer list page (100k DB) | ~0.5s automated |
| Search page | ~50ms automated |
| Backup (100k/300k) | ~2.2s / ~18 MB automated |

Do not load full customer or transaction tables into renderer memory.

---

## 7. Branding vs Paths

| User-facing | Technical compatibility |
|-------------|-------------------------|
| FMT | `%APPDATA%\CustomerAccounting\` |
| FMT-Setup.exe | `com.customeraccounting.app` |
| FMT.exe | npm `customer-accounting` |
