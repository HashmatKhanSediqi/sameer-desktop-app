# Windows Installer

Professional Windows installer specification using NSIS via electron-builder.

---

## 1. Overview

| Attribute | Value |
|-----------|-------|
| Output filename | `CustomerAccounting-Setup.exe` |
| Technology | electron-builder + NSIS |
| Target | Windows 10/11 (64-bit) |
| Install scope | Per-user (recommended) or per-machine |

Customer receives **one file** — no additional runtime installation.

---

## 2. Core Requirements

| ID | Requirement |
|----|-------------|
| INS-01 | Bundle all runtime dependencies (Electron, Node, app code) |
| INS-02 | Create Start Menu shortcut |
| INS-03 | Create Desktop shortcut |
| INS-04 | Configure application directories on first run |
| INS-05 | Preserve user data during updates |
| INS-06 | Safe uninstall — never delete customer data by default |
| INS-07 | Separate APPLICATION FILES from USER DATA |

---

## 3. Directory Separation (Mandatory)

### Application Files (Replaced on Update/Uninstall)

```
%LOCALAPPDATA%\Programs\CustomerAccounting\
```

Contains: executable, Electron runtime, `app.asar`, bundled assets.

### User Data (Never Deleted by Update)

```
%APPDATA%\CustomerAccounting\
```

Contains: database, images, backups, logs, settings.

### NSIS Configuration Principle

```yaml
# electron-builder.yml (conceptual)
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: false
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: Customer Accounting
  # Do NOT include AppData in uninstall delete list
```

---

## 4. Install Flow

```
User runs CustomerAccounting-Setup.exe
        │
        ▼
UAC prompt (if per-machine install)
        │
        ▼
Welcome page
        │
        ▼
License agreement (optional)
        │
        ▼
Choose install location (default: LocalAppData\Programs\CustomerAccounting)
        │
        ▼
Install files + bundled runtime
        │
        ▼
Create shortcuts (Desktop + Start Menu)
        │
        ▼
Finish → Launch application (checkbox, checked by default)
        │
        ▼
First launch: create user data dirs, seed database, show login
```

---

## 5. First Launch After Install

1. `%APPDATA%/CustomerAccounting/data/` created
2. SQLite database initialized with migrations
3. Default admin seeded (`admin` / `admin123`)
4. Default currencies and settings seeded
5. Login screen shown with "Import Existing System" option

---

## 6. Update Install Flow

When user installs newer version over existing:

```
NSIS detects existing installation
        │
        ▼
Close running application (prompt user)
        │
        ▼
Replace files in Programs directory ONLY
        │
        ▼
Do NOT touch %APPDATA%\CustomerAccounting\
        │
        ▼
Launch updated application
        │
        ▼
Run database migrations if needed
```

**Critical:** Update must never run uninstall-delete on user data directories.

---

## 7. Uninstall Flow

```
User: Settings → Apps → Uninstall Customer Accounting
   OR Start Menu → Uninstall shortcut
        │
        ▼
Confirm uninstall
        │
        ▼
Remove %LOCALAPPDATA%\Programs\CustomerAccounting\
        │
        ▼
Remove Start Menu and Desktop shortcuts
        │
        ▼
Prompt: "Keep your data?"
   [Keep Data] (default)  [Remove All Data]
        │
        ▼
If Keep Data: %APPDATA%\CustomerAccounting\ preserved
If Remove All Data: delete entire AppData folder (requires extra confirmation)
```

### Default Behavior

**Keep user data** — customer can reinstall and continue, or restore from backup.

### Remove All Data

- Requires second confirmation checkbox
- Deletes database, images, backups, logs
- Irreversible — warn clearly

---

## 8. Shortcuts

| Shortcut | Target | Location |
|----------|--------|----------|
| Customer Accounting | `CustomerAccounting.exe` | Desktop |
| Customer Accounting | `CustomerAccounting.exe` | Start Menu → Customer Accounting |
| Uninstall | Uninstaller | Start Menu → Customer Accounting |

Icons: application icon (.ico) embedded in executable and shortcuts.

---

## 9. Code Signing (Production)

| Requirement | Purpose |
|-------------|---------|
| Authenticode certificate | Windows SmartScreen trust |
| Sign `CustomerAccounting-Setup.exe` | Installer trust |
| Sign `CustomerAccounting.exe` | Application trust |
| Timestamp server | Signature validity after cert expiry |

Unsigned builds acceptable for development only.

---

## 10. electron-builder Configuration (Reference)

```yaml
appId: com.customeraccounting.app
productName: Customer Accounting
directories:
  output: dist
  buildResources: assets/installer
win:
  target:
    - target: nsis
      arch: [x64]
  icon: assets/icons/icon.ico
  publisherName: Your Company Name
nsis:
  artifactName: CustomerAccounting-Setup.${ext}
  oneClick: false
  perMachine: false
  allowElevation: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  installerIcon: assets/icons/icon.ico
  uninstallerIcon: assets/icons/icon.ico
  installerHeaderIcon: assets/icons/icon.ico
  deleteAppDataOnUninstall: false  # CRITICAL: false
```

**`deleteAppDataOnUninstall: false`** is mandatory.

---

## 11. Installer Contents

Bundled in installer:

- Electron runtime
- Chromium
- Node.js (embedded in Electron)
- Application code (`app.asar`)
- Font files for localization
- SQLite (via native module compiled for Electron)
- All npm production dependencies

**Not bundled:** customer data, development tools.

---

## 12. Version Display

Installer properties dialog shows:
- Product name: Customer Accounting
- Version: from `package.json`
- Publisher: as configured

---

## 13. Silent Install (Optional Enterprise)

For IT deployment:

```
CustomerAccounting-Setup.exe /S
```

Silent install still uses default paths; user data created on first launch.

---

## 14. Pre-Install Checks

| Check | Action |
|-------|--------|
| 64-bit Windows | Required; show error on 32-bit |
| Disk space | Minimum 500 MB free |
| Running instance | Prompt to close |

---

## 15. Testing Checklist

- [ ] Clean Windows VM: install from single exe, app launches
- [ ] Desktop shortcut works
- [ ] Start Menu shortcut works
- [ ] No Node.js/npm required on machine
- [ ] User data created in AppData on first launch
- [ ] Update install preserves database and images
- [ ] Uninstall (keep data) preserves AppData folder
- [ ] Uninstall (remove all) deletes AppData with confirmation
- [ ] Reinstall after uninstall (keep data) reconnects to existing database

---

## 16. Build Command (Reference)

```bash
npm run build:win
# Produces: dist/CustomerAccounting-Setup.exe
```

Document in application README when code exists — not part of this spec package.

---

## 17. Installer Localization (Future)

NSIS supports multilingual installers. v1.0 may ship English installer UI; application UI fully localized separately.

Consider MUI installer with English, Dari, Pashto for v1.1+.
