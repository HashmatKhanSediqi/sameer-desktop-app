# Authentication

Administrator login, session management, and credential handling for **FMT**.

---

## 1. Overview

| Attribute | Value |
|-----------|-------|
| Model | Single administrator, full access |
| Default username | `admin` |
| Default password | `admin123` |
| Storage | Password hash in SQLite `admin_users` table |
| Session | In-memory session in main process (v1.0) |
| Password change | Implemented (Settings) |
| Recovery | Hashed security question/answer |

---

## 2. Default Account Seeding

On **first application startup** (when `admin_users` is empty):

1. Create row: username `admin`
2. Hash password `admin123` with bcrypt (cost ≥ 10)
3. Store hash only — never plaintext

**Rules:**
- Do NOT auto-change password on install, update, or restore (unless backup contains different hash)
- Do NOT force password change on first login
- Restore from backup replaces admin hash with backup's hash

---

## 3. Login Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ Login Form  │────►│ AuthService  │────►│ Session     │
│ (Renderer)  │ IPC │ (Main)       │     │ (Main mem)  │
└─────────────┘     └──────────────┘     └─────────────┘
                           │
                           ▼
                    bcrypt.compare
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
         success                   failure
    return sessionId           return error (localized)
    navigate to main           stay on login
```

### Login Form Requirements

| Requirement | Implementation |
|-------------|----------------|
| No autofill | `autocomplete="off"` on form; password field `autoComplete="new-password"` |
| No saved credentials | Do not use browser password manager hooks |
| No default visible password | Placeholder only, not pre-filled value |
| Username field | Text input, not email type |
| Error feedback | Generic "Invalid username or password" (do not reveal which failed) |

---

## 4. Password Hashing

| Parameter | Value |
|-----------|-------|
| Algorithm | bcrypt |
| Cost factor | 10 (minimum) |
| Salt | Generated per hash by bcrypt |

```typescript
// Pseudocode — main process only
import bcrypt from 'bcrypt';

const HASH = await bcrypt.hash('admin123', 10);
const valid = await bcrypt.compare(inputPassword, storedHash);
```

**Never:**
- Store plaintext password in DB, files, logs, or memory longer than verification
- Log password or hash values
- Transmit password except IPC from renderer to main (internal IPC only)

---

## 5. Session Management

### v1.0 Approach: In-Memory Session

```typescript
interface Session {
  id: string;           // UUID
  userId: number;
  username: string;
  createdAt: Date;
  lastActivityAt: Date;
}
```

- Session created on successful login
- Session ID returned to renderer (stored in renderer memory only, not localStorage)
- Each protected IPC call validates session in main process
- Session expires after **8 hours idle** (configurable in settings future)
- Logout destroys session

### Session Validation

Every IPC handler for protected resources:

```
1. Extract sessionId from request
2. Lookup session in SessionStore
3. If missing/expired → return AUTH_ERROR
4. Update lastActivityAt
5. Proceed with handler
```

### App Restart

- Session cleared on quit
- User must login again

---

## 6. Protected Routes

Renderer route guard:

- `/login`, `/restore` — public
- All other routes — require valid session (`auth:checkSession` on app load)

If session invalid → redirect to login.

---

## 7. Logout

- Clear session in main process
- Clear session ID in renderer
- Navigate to login
- Do not clear user data

---

## 8. Pre-Login Restore Access

The **"Import Existing System"** flow is accessible **without login** because:

- Fresh install has empty database
- Admin credentials come from restored backup

After successful restore → redirect to login with restored admin credentials.

---

## 9. Extensibility (Settings)

Architecture must support future features without rewrite:

| Feature | Hook |
|---------|------|
| Change password | Settings → Account & Security → bcrypt hash update; all sessions invalidated |
| Forgot password | Login → recovery with username + hashed security answer |
| Multiple admins | Additional rows in `admin_users`; session includes userId |
| Session timeout config | Setting key `session_timeout_minutes` |
| Lock screen | Re-auth without full logout |

Implemented: login, logout, session check, default seed, password change, hashed security-hint recovery. Default `admin` / `admin123` is unchanged until the administrator changes it.

---

## 10. Security Considerations

| Threat | Mitigation |
|--------|------------|
| Brute force | Optional: lockout after N failures (future); acceptable v1.0: no lockout on local desktop |
| Session hijacking | Session ID only in app memory; not in URL |
| Password in logs | Never log credentials |
| SQL injection | Parameterized queries only |

See `security.md` for comprehensive security documentation.

---

## 11. IPC API

### `auth:login`

**Input:** `{ username: string, password: string }`

**Output success:** `{ success: true, sessionId: string, username: string }`

**Output failure:** `{ success: false, errorCode: 'INVALID_CREDENTIALS' }`

### `auth:logout`

**Input:** `{ sessionId: string }`

**Output:** `{ success: true }`

### `auth:checkSession`

**Input:** `{ sessionId: string }`

**Output:** `{ valid: boolean, username?: string }`

### `auth:changePassword`

**Input:** `{ sessionId, currentPassword, newPassword, confirmPassword }`

**Output success:** `{ success: true, sessionInvalidated: true }` — user must sign in again.

### `auth:setRecovery` / `auth:recoveryStatus`

Session required. The answer is bcrypt-hashed after trim/lowercase/whitespace collapse. Never stored or logged in plaintext.

### `auth:recoveryPrompt` / `auth:recoverPassword`

Public (no session). Failed recoveries always return `RECOVERY_FAILED`. New password must meet the same policy as password change.

---

## 12. Error Codes (Localized)

| Code | User Message Key |
|------|------------------|
| `INVALID_CREDENTIALS` | `auth.error.invalidCredentials` |
| `SESSION_EXPIRED` | `auth.error.sessionExpired` |
| `NOT_AUTHENTICATED` | `auth.error.notAuthenticated` |
