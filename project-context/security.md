# Security

Security architecture for the offline **FMT** desktop application.

---

## 1. Threat Model

| Threat | Context | Severity |
|--------|---------|----------|
| Unauthorized access | Local machine — admin login | Medium |
| SQL injection | IPC → SQLite queries | High |
| Malicious import file | Excel upload | Medium |
| Malicious backup file | Restore flow | High |
| Malicious update package | GitHub Releases feed | Critical — mitigated by electron-updater checksums; code signing not configured |
| Path traversal | Backup/archive extraction | High |
| XSS in renderer | React app | Medium |
| Data loss | Failed migration/import/restore | High |
| Unencrypted backup theft | `.cab` file copied off machine | Medium |
| Pre-login restore misuse | Physical access to PC | Medium |

**Out of scope v1.0:** Network attacks on cloud (no cloud data), multi-user privilege escalation.

---

## 2. Password Security

| Requirement | Implementation |
|-------------|----------------|
| No plaintext storage | bcrypt hash in `admin_users.password_hash` |
| Algorithm | bcrypt, cost ≥ 10 |
| Default password | `admin123` hashed at seed — never store plaintext |
| No auto-change | Credentials unchanged unless admin explicitly changes |
| No logging | Never log password, hash, recovery answer, or comparison result |
| Recovery answer | bcrypt hash of normalized answer; never plaintext |
| Password change | Current password required; new password 8–128 characters; sessions cleared |

Default credentials for v1.0 (must not change without explicit request):

- Username: `admin`
- Password: `admin123`

---

## 3. Session Handling

| Aspect | v1.0 Design |
|--------|-------------|
| Storage | In-memory in main process (Map) |
| Token | UUID session ID |
| Transmission | IPC only — not in URL |
| Expiry | Idle timeout (configured; default 8 hours) |
| Invalidation | Logout, app quit, expiry, password change, successful restore |

Protected IPC handlers **must** validate session before mutating accounting data.

---

## 4. Electron Security

| Setting | Value |
|---------|-------|
| `nodeIntegration` | `false` |
| `contextIsolation` | `true` |
| `sandbox` | `true` |
| Remote module | Disabled |
| `webSecurity` | `true` |
| Preload | Minimal API via `contextBridge` |

---

## 5. SQL Injection Prevention

- Parameterized queries only via `better-sqlite3` prepared statements
- Dynamic SQL limited to fixed clause fragments + `?` placeholders

---

## 6. Input Validation

| Input | Validation |
|-------|------------|
| Amount | Positive decimal, max 4 places; Latin digits only in UI |
| Currency | Whitelist from `currencies` table |
| Customer name / number | Max length, strip control characters |
| Note | Allow Unicode; strip null bytes |
| Dates | Valid datetime strings |
| IDs | Positive integers |

---

## 7. File Upload Validation

### Profile photos / company logo

- Magic-byte type checks
- Size limits
- Path must remain inside intended images directories
- Sanitized filenames

### Import

- XLSX/ZIP magic, 50 MB limit, 100k row limit, path-traversal rejection
- Formula results only (no VBA/macro execution)

### Backups

- Entry allow-list, zip-bomb limits, checksum/signature, SQLite magic + integrity
- See `backup-restore.md`

---

## 8. Backup Confidentiality

**v1.0 backups are unencrypted.** Document this to operators. Password-protected / encrypted backups are a future improvement and must preserve `.cab` compatibility or provide a migration.

---

## 9. Pre-Login Restore Authorization

| Channel | Auth Required |
|---------|---------------|
| `auth:login` | No |
| `auth:recoveryPrompt` / `auth:recoverPassword` | No (no username/answer leak differentiation beyond generic failure) |
| `backup:validate` | **No** (intentional pre-login recovery) |
| `restore:execute` | **No** (intentional; requires `confirmed: true`) |
| `backup:create` | Yes |
| Accounting / settings / import / reports mutations | Yes |

This is a **known accepted risk** for local disaster recovery when the database prevents login.

---

## 10. Database Integrity

| Measure | Status |
|---------|--------|
| WAL mode | Enabled |
| `foreign_keys = ON` | Enabled |
| `busy_timeout = 5000` | Enabled |
| `synchronous = NORMAL` | Enabled |
| `integrity_check` on connect | Enabled — fails with `DATABASE_CORRUPTED` |
| Crash sentinel (`.crash`) | Warns on unclean previous shutdown |
| Auto-overwrite corrupt DB | **Never** |

---

## 11. Accounting Integrity Notes

| Topic | Status |
|-------|--------|
| Transfer atomicity | Both legs in one SQLite transaction; balance check inside transaction |
| Cash-out / edit negative balances | **Allowed** unless business later requires a gate |
| Monetary writes | `decimal.js` / decimal TEXT |
| Aggregate SQL | May use `CAST(amount AS REAL)` — theoretical precision risk at extreme values |

---

## 12. Update Verification (v1.0+)

When updates ship: HTTPS, checksum, Authenticode. **Not active in v1.0.**

---

## 13. Local Database Protection

| Measure | v1.0 |
|---------|------|
| Encryption at rest | Not required / not implemented |
| File permissions | Default `%APPDATA%` user-scope |
| Physical access | Physical access ≈ data access |

---

## 14. Sensitive Data in Logs

**Never log:** passwords, hashes, session tokens, recovery answers, full DB dumps.  
**May log:** operation type, error codes, paths (non-secret), timings.

---

## 15. Security Testing Coverage

Automated coverage includes (non-exhaustive): session rejection, backup traversal/corruption rejection, auth recovery hashing, migration failure safety, database corruption rejection, path containment for photos.

Optional gap: dedicated zip-bomb unit test (limits exist).
