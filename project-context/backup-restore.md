# Backup and Restore

Full system backup, portable restore, and safety mechanisms.

---

## 1. Overview

Backup/restore is **critical infrastructure**. The system must allow complete recovery of all application state on the same or a new installation.

| Attribute | Value |
|-----------|-------|
| Backup extension | `.cab` |
| Filename pattern | `CustomerAccounting_Backup_YYYY-MM-DD.cab` |
| Portability | Restorable on fresh install |
| Pre-login restore | Yes — "Import Existing System" |

---

## 2. What Backup Must Include

| Component | Source | Required |
|-----------|--------|----------|
| SQLite database | `data/accounting.db` | Yes |
| WAL/SHM files | If present at backup time | Yes (or checkpoint first) |
| Customer profile images | `data/images/customers/` | Yes |
| Settings | In database `settings` table | Yes |
| Currencies | In database `currencies` table | Yes |
| Admin account | In database `admin_users` table | Yes |
| Localization preference | In `settings.language` | Yes |
| App metadata | `app_metadata` table | Yes |
| Schema version | `schema_migrations` table | Yes |

**Everything necessary to recreate the customer's system.**

---

## 3. Backup Format (`.cab`)

Custom archive format — not raw SQLite exposed to users.

### Internal Structure

```
CustomerAccounting_Backup_2025-08-21.cab
├── manifest.json          # Metadata and checksums
├── database/
│   └── accounting.db      # SQLite file (WAL checkpointed before copy)
├── images/
│   └── customers/
│       ├── 1.jpg
│       └── 2.png
└── signature.sha256       # Optional integrity hash of manifest + files
```

### manifest.json Schema

```json
{
  "format_version": "1.0",
  "app_version": "1.0.0",
  "schema_version": 1,
  "created_at": "2025-08-21T18:30:00.000Z",
  "created_by": "Customer Accounting",
  "platform": "win32",
  "statistics": {
    "customer_count": 42,
    "transaction_count": 1337,
    "currency_codes": ["AFN", "USD", "EUR"]
  },
  "files": [
    {
      "path": "database/accounting.db",
      "sha256": "abc123...",
      "size_bytes": 1048576
    },
    {
      "path": "images/customers/1.jpg",
      "sha256": "def456...",
      "size_bytes": 204800
    }
  ],
  "settings_snapshot": {
    "language": "fa-AF"
  }
}
```

### Archive Implementation

- **Canonical (v1.0):** ZIP-compatible stream via `archiver`, using `.cab` file extension
- Must be openable programmatically by the app
- Compress for portability (zlib/deflate)

**User sees:** single `.cab` file — not individual DB files.

---

## 4. Backup Creation Flow

```
User clicks Backup → Save dialog (.cab default name)
        │
        ▼
BackupService.create(destinationPath):
  1. WAL checkpoint: PRAGMA wal_checkpoint(FULL)
  2. Create temp staging directory
  3. Copy accounting.db to staging/database/
  4. Copy all customer images to staging/images/
  5. Query statistics (counts)
  6. Write manifest.json with checksums
  7. Write signature.sha256 (hash of all content)
  8. Compress to .cab
  9. Cleanup temp
  10. Update app_metadata.last_backup_at
        │
        ▼
Success dialog with path, size, counts
```

### Progress UI

- Indeterminate or determinate progress bar
- Cancel not recommended mid-write (disable cancel during final compress)

---

## 5. Restore Flow (Pre-Login)

Accessible from login screen → **"Import Existing System"**

```
User selects .cab file
        │
        ▼
BackupService.validate(filePath):
  1. Verify file structure
  2. Parse manifest.json
  3. Verify format_version compatible
  4. Verify checksums of all files
  5. Optionally open DB read-only to verify SQLite integrity
  6. Return metadata for display
        │
        ▼
Restore Preview UI:
  - Backup date (created_at)
  - App version
  - Customer count
  - Transaction count
  - Language setting
  - Warning if app version mismatch
        │
        ▼
User checks "I understand..." checkbox
User clicks Restore
        │
        ▼
If existing data detected:
  Create SAFETY BACKUP of current data first
  → CustomerAccounting_SafetyBackup_YYYY-MM-DD_HH-mm.cab
        │
        ▼
RestoreService.execute():
  1. Stop database connection
  2. Replace accounting.db
  3. Replace images directory
  4. Restart database connection
  5. Run migrations if app schema newer than backup
  6. Verify integrity
        │
        ▼
Redirect to Login (use restored admin credentials)
```

---

## 6. Safety Backup Before Destructive Restore

**Mandatory** when restoring over existing non-empty database.

| Condition | Action |
|-----------|--------|
| Fresh install (empty DB) | No safety backup needed |
| Existing customers or transactions | Create safety backup automatically before overwrite |
| Safety backup failure | Abort restore; show error |

Safety backup saved to: `%APPDATA%/CustomerAccounting/backups/auto/`

Notify user of safety backup location in success dialog.

---

## 7. Validation Rules

| Check | Failure Action |
|-------|----------------|
| File not valid archive | Reject: "Invalid backup file" |
| Missing manifest.json | Reject |
| format_version unsupported | Reject with version message |
| Checksum mismatch | Reject: "Backup file corrupted" |
| SQLite integrity check fails | Reject |
| manifest statistics mismatch | Warning (proceed if DB valid) |

### Malicious Backup Protection

- Do not execute any content from backup
- Validate all paths in archive — reject path traversal (`../`)
- Max uncompressed size limit (e.g., 500 MB) to prevent zip bomb
- Verify SQLite file magic header before replace

See `security.md`.

---

## 8. Version Compatibility

| Scenario | Behavior |
|----------|----------|
| Backup from older app version | Restore DB; run forward migrations on startup |
| Backup from newer app version | Warn "Backup from newer version"; block or attempt read-only preview |
| format_version 1.x | Current reader must support all 1.x |

Document format_version bumps in `changelog.md`.

---

## 9. In-App Restore (Post-Login, Optional)

v1.0 primary restore is pre-login. Optional Settings → Restore from Backup:

- Same validation and safety backup flow
- Requires admin confirmation
- Logs out after restore (session invalidated)

---

## 10. Automatic Backups (Future)

Architecture should allow scheduled auto-backup to `%APPDATA%/CustomerAccounting/backups/scheduled/`.

Not required v1.0 — document hook in Settings.

---

## 11. IPC API

### `backup:create`

**Input:** `{ sessionId, destinationPath? }` — if no path, open save dialog from main

**Output:**
```typescript
{
  success: boolean;
  filePath?: string;
  manifest?: ManifestSummary;
  error?: string;
}
```

### `backup:validate`

**Input:** `{ filePath }` — no session required (pre-login)

**Output:**
```typescript
{
  valid: boolean;
  manifest?: {
    createdAt: string;
    appVersion: string;
    customerCount: number;
    transactionCount: number;
    language: string;
  };
  errors?: string[];
  warnings?: string[];
}
```

### `restore:execute`

**Input:** `{ filePath, confirmed: true }`

**Output:**
```typescript
{
  success: boolean;
  safetyBackupPath?: string;
  error?: string;
}
```

---

## 12. User Data Locations

| Path | Content |
|------|---------|
| `%APPDATA%/CustomerAccounting/data/` | Database, images |
| `%APPDATA%/CustomerAccounting/backups/auto/` | Safety backups |
| User-chosen path | Manual backups |

Manual backups are portable — user may store on USB, network drive, etc.

---

## 13. Error Messages (Localized)

```
backup.success
backup.error.writeFailed
restore.invalidFile
restore.corrupted
restore.versionMismatch
restore.confirmRequired
restore.safetyBackupCreated
restore.success
```

---

## 14. Testing Checklist

- [ ] Backup creates valid .cab with all components
- [ ] Restore on fresh install works via pre-login flow
- [ ] Restored data matches original (customers, transactions, images, settings)
- [ ] Safety backup created before overwrite
- [ ] Corrupted backup rejected
- [ ] Cancel before restore leaves data unchanged
- [ ] Admin credentials work after restore
- [ ] Path traversal in archive rejected
