# Security

Security architecture for the offline Customer Accounting desktop application.

---

## 1. Threat Model

| Threat | Context | Severity |
|--------|---------|----------|
| Unauthorized access | Local machine — admin login | Medium |
| SQL injection | IPC → SQLite queries | High |
| Malicious import file | Excel upload | Medium |
| Malicious backup file | Restore flow | High |
| Malicious update package | Update server compromise | Critical |
| Path traversal | Backup/archive extraction | High |
| XSS in renderer | React app | Medium |
| Data loss | Failed migration/import | High |

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

```typescript
// Main process only
const valid = await bcrypt.compare(inputPassword, storedHash);
```

---

## 3. Session Handling

| Aspect | v1.0 Design |
|--------|-------------|
| Storage | In-memory in main process (Map) |
| Token | UUID v4 session ID |
| Transmission | IPC only — not in URL |
| Expiry | 8 hours idle |
| Invalidation | Logout, app quit, expiry |

Protected IPC handlers **must** validate session before any operation.

---

## 4. Electron Security

| Setting | Value |
|---------|-------|
| `nodeIntegration` | `false` in renderer |
| `contextIsolation` | `true` |
| `sandbox` | `true` (preload only) |
| Remote module | Disabled |
| `webSecurity` | `true` |
| Preload | Minimal exposed API via `contextBridge` |

### IPC Validation

- Whitelist channels only
- Validate all input types and ranges in main process
- Reject unexpected fields

---

## 5. SQL Injection Prevention

- **Parameterized queries only** — never string concatenation
- Use prepared statements via `better-sqlite3`

```typescript
// CORRECT
db.prepare('SELECT * FROM customers WHERE id = ?').get(id);

// WRONG
db.prepare(`SELECT * FROM customers WHERE id = ${id}`).get();
```

---

## 6. Input Validation

### General Rules

| Input | Validation |
|-------|------------|
| Amount | Positive decimal, max 4 places, max magnitude |
| Currency | Whitelist from `currencies` table |
| Customer name | Max length, strip control characters |
| Customer number | Max length, alphanumeric + common punctuation |
| Note | Allow Unicode; strip null bytes |
| Dates | Valid ISO date, reasonable range |
| IDs | Positive integers |

### Sanitization

- Trim whitespace on text fields
- Reject null bytes in all strings
- Normalize currency codes to uppercase

---

## 7. File Upload Validation (Profile Photos)

| Check | Rule |
|-------|------|
| File type | Magic bytes verification (JPEG, PNG, WebP) — not extension only |
| Max size | 5 MB |
| Dimensions | Optional max 4096×4096 |
| Filename | Sanitize; store as `{customer_id}.{ext}` |
| Path | Must stay within `data/images/customers/` |

Reject executable content disguised as images.

---

## 8. Import Validation

See `import-export.md`. Security additions:

| Check | Purpose |
|-------|---------|
| Max rows | 100,000 — prevent DoS |
| Max file size | 50 MB |
| Parse timeout | 60 seconds |
| No macro execution | XLSX parsing only |
| String length limits on parse | Note field exempt (but max row count limits total) |

---

## 9. Backup Protection

### Creation

- Backup contains sensitive financial data — user responsible for storage security
- Optional future: password-protected backup (not v1.0)

### Restore Validation

| Check | Purpose |
|-------|---------|
| Archive structure | Valid manifest and files |
| Checksum verification | Detect tampering/corruption |
| Path traversal rejection | Block `../` in entry paths |
| Max uncompressed size | 500 MB — zip bomb prevention |
| SQLite magic header | Verify file is SQLite before replace |
| `PRAGMA integrity_check` | After restore |

**Never execute** any file from backup archive.

---

## 10. Update Verification

| Layer | Method |
|-------|--------|
| Transport | HTTPS only |
| Integrity | SHA512 checksum vs manifest |
| Authenticity | Authenticode signature on Windows installer |
| Downgrade | Optional policy block |

Reject update if any verification fails.

---

## 11. Local Database Protection

SQLite file on local disk — protected by OS file permissions (user scope).

| Measure | v1.0 |
|---------|------|
| Encryption at rest | Optional future (SQLCipher) — not required v1.0 |
| File permissions | Default `%APPDATA%` user-only access |
| WAL mode | Enabled for integrity |

Document in user-facing docs: physical access to machine = access to data.

---

## 12. Renderer XSS Prevention

- React auto-escapes by default
- Never use `dangerouslySetInnerHTML` for user content
- Sanitize if rendering rich text (not planned v1.0)

---

## 13. Error Handling Security

- Do not expose stack traces to user
- Log detailed errors to file only (`logs/app.log`)
- Generic user messages for auth failures

---

## 14. Dependency Security

- Lock file (`package-lock.json`) committed
- Periodic `npm audit` in development
- Pin major dependency versions

---

## 15. Sensitive Data in Logs

**Never log:**
- Passwords
- Password hashes
- Session tokens
- Full database contents

**May log:**
- Operation type
- Error codes
- Timestamps
- Non-sensitive IDs

---

## 16. IPC Authorization Matrix

| Channel | Auth Required |
|---------|---------------|
| `auth:login` | No |
| `auth:logout` | Yes |
| `backup:validate` | No (pre-login restore) |
| `restore:execute` | No (pre-login) — but requires UI confirmation |
| All other channels | Yes |

---

## 17. Compliance Notes

This is local business accounting software — no GDPR cloud processing. User controls their own data and backups.

---

## 18. Security Testing

See `testing.md`:
- [ ] SQL injection attempt in customer name fails safely
- [ ] Invalid session rejected on protected IPC
- [ ] Corrupted backup rejected
- [ ] Path traversal archive rejected
- [ ] Oversized import rejected
- [ ] Invalid image file rejected
- [ ] Unsigned update rejected (when update feature active)
