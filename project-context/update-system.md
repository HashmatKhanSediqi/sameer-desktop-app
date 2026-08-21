# Update System

Online application update architecture with local data preservation.

---

## 1. Overview

| Attribute | Value |
|-----------|-------|
| Normal operation | Fully offline |
| Update server | Online endpoint for app updates ONLY |
| Customer data | Always local (SQLite) — never cloud |
| Update tool | `electron-updater` (recommended) |

The update system distributes **application binaries** — not customer accounting data.

---

## 2. Principles

1. **Updates must NEVER delete customer data**
2. **Application files and user data are separate**
3. **Database preserved across updates**
4. **Profile images preserved**
5. **Settings preserved**
6. **Admin credentials preserved**
7. **Schema migrations run safely after update**
8. **Update packages must be verified** (signature/checksum)

---

## 3. Version Detection

### Current Version Sources

| Source | Purpose |
|--------|---------|
| `package.json` version | Build-time version |
| `app_metadata.app_version` | Runtime recorded version |
| Windows file properties | Installer display version |

On startup, compare installed version with last recorded; update `app_metadata` if changed.

---

## 4. Update Check Flow

```
User: Settings → Check for Updates (or automatic periodic check)
        │
        ▼
UpdateService.check():
  GET https://updates.example.com/customer-accounting/latest.yml
  (or electron-updater generic provider)
        │
        ▼
Compare semver with current version
        │
   ┌────┴────┐
   ▼         ▼
 Up to     Update
 date      available
   │         │
   ▼         ▼
 Message   Show version notes + Download button
```

### Update Server Response (electron-updater format)

```yaml
version: 1.1.0
files:
  - url: CustomerAccounting-Setup-1.1.0.exe
    sha512: ...
    size: ...
path: CustomerAccounting-Setup-1.1.0.exe
sha512: ...
releaseDate: '2025-09-01T00:00:00.000Z'
releaseNotes: |
  - Added currency XYZ support
  - Bug fixes
```

**Note:** Replace `updates.example.com` with actual update server URL during deployment.

---

## 5. Download and Verify

```
Download installer to temp directory
        │
        ▼
Verify SHA512 checksum against manifest
        │
        ▼
Verify code signature (Authenticode on Windows)
        │
   ┌────┴────┐
   ▼         ▼
 Fail      Pass
   │         │
   ▼         ▼
 Error    Prompt install
```

**Never install unverified updates.**

---

## 6. Install Update

### Recommended: electron-updater with NSIS

- Download delta or full installer
- Quit application gracefully:
  1. Close SQLite connection (WAL checkpoint)
  2. Flush logs
  3. Launch installer in silent/one-click mode
- NSIS installer updates `%LOCALAPPDATA%/Programs/CustomerAccounting/` (application files)
- User data in `%APPDATA%/CustomerAccounting/` **untouched**

### Install Directory Separation

| Location | Updated? |
|----------|----------|
| `C:\Users\{user}\AppData\Local\Programs\CustomerAccounting\` | Yes — app binaries |
| `C:\Users\{user}\AppData\Roaming\CustomerAccounting\` | **No** — user data |

---

## 7. Post-Update Startup

```
Application starts new version
        │
        ▼
Open existing SQLite database (unchanged path)
        │
        ▼
Run MigrationRunner:
  - Apply pending schema migrations
  - If migration fails → restore from pre-update safety backup
        │
        ▼
Update app_metadata.app_version
        │
        ▼
Normal login flow
```

---

## 8. SQLite Schema Migration Strategy

### Rules

1. **Forward-only migrations** — numbered SQL files
2. **Never DROP data** without explicit migration script that preserves data
3. **Backup before migrate** — automatic safety backup on first launch after update if schema version changes
4. **Transactional migrations** — each migration in BEGIN/COMMIT
5. **Test migrations** against copy of production DB structure

### Migration Failure Recovery

```
Migration fails
        │
        ▼
Log error to update-migration.log
        │
        ▼
Restore database from pre-update safety backup
        │
        ▼
Show error dialog:
  "Update could not complete database upgrade.
   Your previous data has been restored.
   Please contact support."
        │
        ▼
Do not leave DB in partial state
```

### Example Migration

```sql
-- 002_add_currency_display_format.sql
ALTER TABLE currencies ADD COLUMN display_format TEXT DEFAULT 'standard';
UPDATE schema_migrations ... -- handled by runner
```

SQLite `ALTER TABLE` limitations: use table-rebuild pattern for complex changes.

---

## 9. Pre-Update Safety Backup

Before applying update that includes schema changes:

1. Create `%APPDATA%/CustomerAccounting/backups/pre-update/CustomerAccounting_PreUpdate_{version}_{timestamp}.cab`
2. Proceed with update only if backup succeeds
3. Retain last 3 pre-update backups; prune older

---

## 10. Data Preservation Checklist

After every update, verify:

- [ ] `accounting.db` exists and opens
- [ ] Customer count unchanged
- [ ] Transaction count unchanged
- [ ] Profile images accessible
- [ ] Settings preserved (language, pagination)
- [ ] Admin login works with same credentials
- [ ] Existing `.cab` backups still restorable

---

## 11. Offline Behavior

- Update check fails gracefully: "Could not check for updates. Please check your internet connection."
- No update forced
- App fully functional offline

---

## 12. IPC API

### `update:check`

**Input:** `{ sessionId }`

**Output:**
```typescript
{
  currentVersion: string;
  updateAvailable: boolean;
  latestVersion?: string;
  releaseNotes?: string;
  error?: string;
}
```

### `update:downloadAndInstall`

**Input:** `{ sessionId }`

**Output:** Triggers download; emits progress events; launches installer on success

---

## 13. Rollback Strategy

If update causes critical bug:

1. User installs previous version installer manually (distributed separately)
2. Pre-update safety backup available for DB rollback
3. Downgrade installer must not delete user data (same NSIS rules)

---

## 14. Versioning and Release Channels (Future)

| Channel | Purpose |
|---------|---------|
| stable | Default production |
| beta | Optional opt-in |

Architecture hook in Settings; v1.0 ships stable only.

---

## 15. Security

- HTTPS only for update server
- Certificate pinning optional
- Verify Authenticode signature on Windows
- Reject downgrades if policy requires (optional)

See `security.md`.

---

## 16. Implementation Timeline

| Phase | Scope |
|-------|-------|
| v1.0 | Architecture ready; manual update via new installer acceptable |
| v1.1 | In-app update check and install |
| v1.2 | Delta updates, release channels |

Document actual implementation version in `changelog.md`.

---

## 17. Testing Checklist

- [ ] Update preserves database file
- [ ] Update preserves images
- [ ] Update preserves settings and admin hash
- [ ] Schema migration applies correctly
- [ ] Migration failure restores safety backup
- [ ] Invalid checksum rejected
- [ ] Offline update check shows friendly error
