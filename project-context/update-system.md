# Update System

In-app update architecture for **FMT** using **electron-updater** and **GitHub Releases**.

> **v1.0.1 status:** In-app updates **shipped** via GitHub Releases (`electron-updater`). GitHub Release **v1.0.1** publishes `FMT-Setup.exe`, `latest.yml`, and blockmap. A packaged 1.0.0 build should detect 1.0.1 from this feed. Live update *install* from an older build on a clean VM has **not** been manually verified.

---

## 1. Overview

| Attribute | Value |
|-----------|-------|
| Product | FMT |
| Normal operation | Fully offline-first |
| Update source | GitHub Releases (`provider: github`) |
| Owner / repo | `HashmatKhanSediqi/sameer-desktop-app` (override via `FMT_UPDATE_OWNER` / `FMT_UPDATE_REPO`) |
| Customer data | Always local (SQLite) — never cloud |
| Update tool | `electron-updater` |
| Installer artifact | `FMT-Setup.exe` (+ `latest.yml` / blockmap from electron-builder) |
| Compatibility paths | `%LOCALAPPDATA%\Programs\CustomerAccounting\`, `%APPDATA%\CustomerAccounting\` |

The update system distributes **application binaries** — not customer accounting data.

---

## 2. Architecture

```
Settings → Update UI
        │
        ▼
preload window.api.update.*
        │
        ▼
IPC: update:getStatus | update:check | update:download | update:install
        │
        ▼
UpdateService (main)
  - semver compare (shared/semver)
  - electron-updater adapter (GitHub feed)
  - states: idle | checking | upToDate | available | downloading | ready | error | unsupported
        │
        ▼ (install only)
BackupService.createPreUpdateBackup()  →  validated .cab under backups/pre-update/
        │
   ┌────┴────┐
 fail      success
   │         │
   ▼         ▼
 block    quitAndInstall()
 install
```

- **Dev / unpackaged:** state is `unsupported`.
- **Packaged:** auto-check after startup delay, then at most once per 24 hours.
- **Manual check:** Settings → Application updates.
- **No newer release:** state is `upToDate` ("You are up to date."). This is not an error.
- **Network / GitHub failure:** state is `error` ("Could not check for updates. You can keep using FMT offline.").
- electron-updater "no update available" messages are mapped to `upToDate`, never to the offline error.

---

## 3. GitHub Release configuration

### Repository

Configured in:

- `package.json` → `build.publish` (`provider: github`, owner/repo)
- `src/shared/constants/updateConfig.ts` (runtime feed + env overrides)

### Required release format

1. Create a **GitHub Release** with tag matching semver, e.g. `v1.0.1` or `1.0.1`.
2. Publish **electron-builder** Windows artifacts for that version, typically:
   - `FMT-Setup.exe`
   - `latest.yml` (and related checksum / blockmap files electron-builder emits)
3. Release must be discoverable as the **latest** release for the configured repo (electron-updater GitHub provider).

### How discovery works

`electron-updater` reads the GitHub Releases feed / `latest.yml` for the configured owner/repo, compares remote `version` to the running app version (`APP_VERSION` / `package.json`), and only offers a download when the remote version is **newer** valid semver.

### What this step does **not** do

- Does **not** publish a GitHub Release
- Does **not** push release tags
- Does **not** declare v1.0 final

---

## 4. Update flow

1. **Check** — `autoUpdater.checkForUpdates()` (no auto-download).
2. **Available** — remote semver newer than current → UI shows download.
3. **Download** — user-triggered; progress via `download-progress`.
4. **Ready** — update staged locally.
5. **Install** — create + validate pre-update `.cab` backup; only then `quitAndInstall`.
6. **Post-update startup** — existing `%APPDATA%\CustomerAccounting\` DB remains; normal migrations + integrity checks run. Updater does **not** modify the database.

---

## 5. Backup-before-update safety

Before `quitAndInstall`:

1. `BackupService.createPreUpdateBackup()` writes `FMT_PreUpdate_*.cab` under `backups/pre-update/`
2. Backup must complete and pass existing validation (manifest, signature, SQLite integrity)
3. Retention: last **5** pre-update backups
4. If backup fails → **install is blocked**; user is informed; app and DB unchanged

Uses the existing `.cab` format — no second backup format.

---

## 6. Offline / failure behavior

| Condition | Behavior |
|-----------|----------|
| No internet / GitHub down | Check → `error` / checkFailed; app remains usable |
| No newer release | `upToDate` |
| Malformed / invalid version | `error` / invalidVersion; no install |
| Download failure / interrupt | `error` / downloadFailed; install not started |
| Backup failure before install | Install blocked (`UPDATE_BACKUP_FAILED`) |
| Update failure on startup path | Auto-check errors are swallowed; DB startup unaffected |

Update failures must **never** prevent FMT from starting or using the existing database.

---

## 7. Versioning

- Semantic versioning: `MAJOR.MINOR.PATCH`
- Same or older remote versions are not offered
- Invalid versions are rejected
- Source of truth for running version: `src/shared/constants/version.ts` / `package.json`

---

## 8. Security

- Uses electron-updater’s normal GitHub Releases + `latest.yml` checksum verification
- No custom download-and-run of arbitrary URLs
- Downgrades disabled (`allowDowngrade = false`)
- **Code signing:** Authenticode is **not** configured. `signAndEditExecutable` is `false` (avoids electron-builder `winCodeSign`). The FMT icon is embedded by `afterPack` rcedit. Unsigned installers are **not** fully trusted by Windows.

---

## 9. IPC

| Channel | Purpose |
|---------|---------|
| `update:getStatus` | Current snapshot |
| `update:check` | Manual / programmatic check |
| `update:download` | Download available update |
| `update:install` | Safety backup then quitAndInstall |
| `update:status` (event) | Push status to renderer |

All invoke channels require an authenticated `sessionId`.

---

## 10. UI / localization

Settings → About → Application updates section shows current version, status, check / download / restart actions, progress, and errors.

Locales: English, Dari (`fa-AF`), Pashto (`ps`) — no hard-coded user-facing English strings.

---

## 11. Testing status

**Covered in automated tests:** semver compare, state transitions, no-update, available → ready, check/download errors, invalid version, backup-blocks-install, backup-before-install success path, config validation, i18n keys, IPC channel registration, pre-update backup create/validate.

**Not verified without a real GitHub Release:** live check against GitHub, full download of a published artifact, interrupted network download on Windows, SmartScreen behavior, and end-to-end restart-after-install on a clean Windows machine.
