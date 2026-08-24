# Windows Installer

Professional Windows installer specification using NSIS via electron-builder for **FMT**.

---

## 1. Overview

| Attribute | Value |
|-----------|-------|
| Product name | **FMT** |
| Output filename | `FMT-Setup.exe` |
| Executable | `FMT.exe` |
| Shortcut name | `FMT` |
| Technology | electron-builder + NSIS |
| Target | Windows 10/11 (64-bit) |
| Install scope | Per-user (`perMachine: false`) |
| Code signing | **Not configured in v1.0** |

Customer receives **one file** — no additional runtime installation.

---

## 2. Core Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| INS-01 | Bundle all runtime dependencies | Implemented |
| INS-02 | Create Start Menu shortcut | Implemented (`createStartMenuShortcut: true`) |
| INS-03 | Create Desktop shortcut | Implemented (`createDesktopShortcut: true`) |
| INS-04 | Configure application directories on first run | Implemented |
| INS-05 | Preserve user data during updates | Implemented (paths separated) |
| INS-06 | Safe uninstall — never delete customer data by default | Implemented (`deleteAppDataOnUninstall: false`) |
| INS-07 | Separate APPLICATION FILES from USER DATA | Implemented |

---

## 3. Directory Separation (Mandatory)

### Application Files (Replaced on Update/Uninstall)

```
%LOCALAPPDATA%\Programs\CustomerAccounting\
  FMT.exe
  resources\...
```

The folder name `CustomerAccounting` is an **intentional compatibility identifier** (electron-builder / historical app identity). The product brand and shortcuts are **FMT**.

### User Data (Never Deleted by Default Uninstall)

```
%APPDATA%\CustomerAccounting\
  data\
  backups\
  logs\
  ...
```

Same compatibility path — do not rename without a migration plan for existing installs.

### NSIS Configuration (actual `package.json` → `build.nsis`)

```json
{
  "artifactName": "FMT-Setup.${ext}",
  "shortcutName": "FMT",
  "oneClick": false,
  "perMachine": false,
  "createDesktopShortcut": true,
  "createStartMenuShortcut": true,
  "deleteAppDataOnUninstall": false
}
```

`installerIcon` / `uninstallerIcon` / `installerHeaderIcon` / Windows `icon` all use `assets/icons/icon.ico`. Authenticode signing is not configured. `signAndEditExecutable` stays `false` so electron-builder does not require the `winCodeSign` toolchain (its extract fails on Windows without symlink privilege). `afterPack` (`scripts/after-pack-icon.cjs`) embeds the official ICO onto `FMT.exe` with the `rcedit` binary so desktop and Start Menu shortcuts do not fall back to the default Electron icon.

`appId`: `com.customeraccounting.app` (compatibility)  
`productName`: `FMT`

---

## 4. Install Flow

```
User runs FMT-Setup.exe
        │
        ▼
Welcome / license (NSIS)
        │
        ▼
Install to LocalAppData\Programs\CustomerAccounting
        │
        ▼
Create Desktop + Start Menu shortcuts named FMT
        │
        ▼
Finish → optional launch
        │
        ▼
First launch: create user data dirs, migrations, seed admin, show login
```

---

## 5. First Launch After Install

1. `%APPDATA%/CustomerAccounting/data/` created
2. SQLite initialized with migrations `001`–`005`
3. Default admin seeded (`admin` / `admin123`)
4. Default currencies and settings seeded
5. Login screen with "Import Existing System" option
6. Optional company profile setup after first successful login

---

## 6. Update Install Flow

When a newer installer is run over an existing install:

- Replace files under Programs directory only
- Do **not** delete `%APPDATA%\CustomerAccounting\`
- On launch, migration runner applies pending SQL migrations

In-app `electron-updater` is **not** shipped in v1.0 — see `update-system.md`.

---

## 7. Uninstall Flow

```
Uninstall FMT
        │
        ▼
Remove Programs\CustomerAccounting application files
Remove Desktop / Start Menu shortcuts
        │
        ▼
User data in %APPDATA%\CustomerAccounting\ is preserved by default
```

`deleteAppDataOnUninstall: false` is mandatory for v1.0.

---

## 8. Shortcuts

| Shortcut | Target | Location |
|----------|--------|----------|
| FMT | `FMT.exe` | Desktop |
| FMT | `FMT.exe` | Start Menu |

Icons: `assets/icons/icon.ico` (installer, uninstaller, header, window).

---

## 9. Code Signing

| Requirement | v1.0 Status |
|-------------|-------------|
| Authenticode certificate | **Not configured** |
| Sign `FMT-Setup.exe` | Skipped |
| Sign `FMT.exe` | Skipped (`signAndEditExecutable: false`) |

Unsigned builds will commonly trigger Windows SmartScreen warnings. Acceptable for controlled distribution; required for unrestricted public trust.

---

## 10. Build Command

```bash
npm run build:win
# Produces: dist/FMT-Setup.exe
```

---

## 11. Testing Checklist

| Test | Status |
|------|--------|
| `npm run build:win` produces installer | VERIFIED (automated build) |
| Desktop shortcut works | IMPLEMENTED — not manually verified on clean VM |
| Start Menu shortcut works | IMPLEMENTED — not manually verified on clean VM |
| No Node.js required | Expected by packaging — not manually verified on clean VM |
| Uninstall keeps AppData | Configured — not manually verified on clean VM |
| Full clean Windows VM install | **Not performed** in STEP 9 audit |
