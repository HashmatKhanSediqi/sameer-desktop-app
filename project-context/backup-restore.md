# Backup and Restore

Full system backup, portable restore, automatic close backup, and safety mechanisms for **FMT**.

---

## 1. Overview

Backup/restore is **critical infrastructure**. The system must allow complete recovery of all application state on the same or a new installation.

| Attribute | Value |
|-----------|-------|
| Product name in manifests | `FMT` |
| Backup extension | `.cab` (ZIP-compatible archive) |
| Manual filename pattern | `FMT_Backup_YYYY-MM-DD.cab` |
| Safety backup pattern | `FMT_SafetyBackup_YYYY-MM-DD_HH-mm-ss.cab` |
| Auto-close backup pattern | `FMT_AutoClose_YYYY-MM-DD_HH-mm-ss.cab` |
| Portability | Restorable on fresh install |
| Pre-login restore | Yes — "Import Existing System" |
| Encryption | **None in v1.0** — backups are unencrypted |

User data directory (compatibility path): `%APPDATA%\CustomerAccounting\`

---

## 2. What Backup Must Include

| Component | Source | Required |
|-----------|--------|----------|
| SQLite database | `data/accounting.db` | Yes |
| WAL checkpoint | Before copy (`PRAGMA wal_checkpoint(FULL)`) | Yes |
| Customer profile images | `data/images/customers/` | Yes |
| Company logo images | `data/images/company/` | Yes |
| Settings / currencies / admin / metadata | Inside SQLite | Yes |
| Schema version | `schema_migrations` | Yes |

**Everything necessary to recreate the customer's system.**

---

## 3. Backup Format (`.cab`)

### Internal Structure

```
FMT_Backup_2026-08-23.cab
├── manifest.json
├── signature.sha256
├── database/
│   └── accounting.db
└── images/
    ├── customers/
    └── company/
```

### Manifest

- `format_version`: `1.0`
- `created_by`: `FMT`
- Includes app version, schema version, statistics, per-file SHA-256, settings snapshot

### Archive Implementation

- In-process ZIP writer/reader (not shell extraction)
- Path allow-list, CRC checks, zip-bomb size/entry limits before inflate
- User sees a single `.cab` file

---

## 4. Backup Creation Flow

```
User: Settings → Backup → Save dialog
        │
        ▼
BackupService.create(destinationPath):
  1. WAL checkpoint
  2. Stage DB + images
  3. Write manifest + signature
  4. Compress to .cab (atomic rename from staging)
  5. Validate success (file must be a valid backup)
```

A backup is **not** reported successful unless validation succeeds.

### Progress UI

- Progress stages sent via `backup:progress`
- Session required for `backup:create`

---

## 5. Automatic Backup on Application Close

Implemented in v1.0.

| Attribute | Value |
|-----------|-------|
| Trigger | `before-quit` (single-flight; second quit cannot bypass) |
| Location | `%APPDATA%\CustomerAccounting\backups\scheduled\` |
| Filename | `FMT_AutoClose_*.cab` |
| Retention | Keep latest **10** matching prefix |
| Skip when | No accounting data |
| On failure | Log warning; **application still quits** (does not corrupt DB) |
| Timeout | 120 seconds |
| Validation | Create then validate; invalid file deleted |

Database remains open during backup; shutdown/checkpoint occurs after auto-close backup attempt.

---

## 6. Safety Backups Before Restore

| Attribute | Value |
|-----------|-------|
| Location | `%APPDATA%\CustomerAccounting\backups\auto\` |
| Filename | `FMT_SafetyBackup_*.cab` |
| Retention | Keep latest **5** matching prefix |
| Validation | Must validate after create; invalid → abort restore |
| Manual backups | Never auto-deleted |

---

## 7. Restore Flow

```
current DB
   ↓
create + validate safety backup
   ↓
validate incoming backup
   ↓
extract to temporary location
   ↓
validate SQLite database
   ↓
atomically replace database + images
   ↓
reopen database + run migrations if needed
   ↓
verify integrity
   ↓
invalidate all sessions
   ↓
only then report success
```

Any failure leaves the original database recoverable (rollback / no commit of replace).

### Pre-login vs post-login

| Channel | Session required | Why |
|---------|------------------|-----|
| `backup:create` | Yes | Authenticated admin action |
| `backup:validate` | **No** | Pre-login disaster recovery |
| `restore:execute` | **No** | Pre-login disaster recovery; requires `confirmed: true` |

**Known risk:** restore/validate without a normal authenticated session is intentional for locked-out / corrupted-DB recovery. Physical machine access can invoke these IPC channels. UI confirmation remains mandatory for restore.

Restore requires an **explicit file path** (no silent last-validated-path fallback).

---

## 8. Validation Rules

| Check | Failure Action |
|-------|----------------|
| Invalid archive | Reject |
| Missing / invalid manifest | Reject |
| Signature mismatch | Reject |
| Path traversal / disallowed entry | Reject |
| Over size / entry / uncompressed limits | Reject |
| SQLite magic / integrity_check fails | Reject |
| Unsupported format_version | Reject |

---

## 9. Retention Policy Summary

| Category | Directory | Prefix | Keep | Deletes manual backups? |
|----------|-----------|--------|------|-------------------------|
| Manual | User-chosen | `FMT_Backup_` (typical) | Unlimited | N/A — never pruned by app |
| Auto-close | `backups/scheduled/` | `FMT_AutoClose_` | 10 | No |
| Safety | `backups/auto/` | `FMT_SafetyBackup_` | 5 | No |

Pruning only deletes files whose names match the **exact category prefix** and `.cab` extension. Unrelated files are never deleted. Newest valid backups are retained.

---

## 10. Confidentiality

**v1.0 backups are unencrypted.** Treat `.cab` files as sensitive accounting data. Encryption is a candidate for v1.1+ and must not break the existing format without a migration plan.

---

## 11. Scale Note

At ~100k customers / ~300k transactions, automated tests observed backup create ≈ **2.2s** and archive size ≈ **18 MB** (DB-dominant; images add more).

---

## 12. Testing Checklist

- [x] Backup creates valid `.cab` with DB + images (automated)
- [x] Restore restores customers, transactions, photos, admin login (automated)
- [x] Safety backup before overwrite (automated)
- [x] Corrupted / traversal archives rejected (automated)
- [x] Auto-close backup + retention (automated)
- [x] Safety retention ≤ 5 (automated)
- [ ] Manual clean-VM restore smoke test (operator)
