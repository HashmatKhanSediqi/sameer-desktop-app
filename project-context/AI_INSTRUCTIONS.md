# AI Development Instructions

**Read this file completely before writing application code.**

Mandatory rules for AI coding agents implementing **FMT**. Violating these rules can cause data loss, security failures, or broken user experience.

---

## 1. Before You Code

1. **Read the relevant context files** in `project-context/` — start with `README.md`, `release-readiness.md`, then feature-specific docs.
2. **Never guess requirements** when documentation already defines them.
3. Prefer the current implementation and tests over outdated historical notes.

---

## 2. Branding

4. Official product name is **FMT**.
5. Do **not** reintroduce user-facing names “Customer Accounting” / “CustomerAccounting”.
6. Compatibility identifiers (`%APPDATA%\CustomerAccounting\`, `com.customeraccounting.app`, npm name `customer-accounting`) may remain — document why; do not casually rename.

---

## 3. Scope and Change Discipline

7. **Never delete existing features** without explicit user approval.
8. **Never modify unrelated features** when implementing a requested change.
9. **Never introduce MongoDB** or any cloud database for accounting data.
10. **Do not add an Audit Log system.**
11. **Do not add cloud dependencies** for normal operation. In-app updates use GitHub Releases only for application binaries.
12. **Preserve backward compatibility** for backups, database schema, and import formats whenever possible.

---

## 4. Data Safety (Critical)

13. **Never destroy customer data** during migrations, imports, updates, or uninstalls.
14. **Never perform destructive database migrations** without a backup step and documented plan.
15. **Preserve existing manual backups** — never silently delete user-chosen backup files.
16. **Never silently overwrite existing data** during import, restore, or update.
17. **Never silently discard failed Excel import rows.**
18. **Use atomic transactions** for multi-row writes (import commit, transfers, restore).
19. **Create and validate a safety backup** before destructive restore.
20. **Never auto-overwrite a corrupted database** — fail closed and allow restore.

---

## 5. Authentication and Security

21. Default username `admin` and password `admin123` must remain unless the user explicitly requests a change.
22. **Never store plaintext passwords** or recovery answers.
23. Disable browser-style autofill on the login form.
24. Validate all external input — Excel, backups, images, paths.
25. Do not claim backups are encrypted — they are not in v1.0.
26. Pre-login restore without session is intentional; do not “fix” it without a replacement recovery path.

---

## 6. Localization and RTL

27. **Never hardcode localized text** — use i18n namespaces.
28. Dari/Pashto PDF require proper shaping + bidi + embedded fonts — see `reports.md`.

---

## 7. Application Architecture

29. Keep application files and user data separate.
30. Remain offline-first for core features.
31. Use SQLite as the sole database.
32. Maintain modular separation per `architecture.md`.
33. **Never mix currencies mathematically.**
34. Do not load entire customer/transaction tables into the renderer — use SQL pagination/aggregation.

---

## 8. UI/UX Rules

35. **Cash In = GREEN. Cash Out = RED.** Non-negotiable.
36. Destructive actions require explicit confirmation.
37. Main page after login is the customer list.
38. Show separate totals per currency — never a mixed grand total.

---

## 9. Testing and Documentation

39. Test major changes per `testing.md`.
40. Update documentation when behavior changes.
41. Update `changelog.md` and `release-readiness.md` when release posture changes.
42. Follow `coding-rules.md`.
43. Be precise about scale: do not claim 1M+ customers without an empirical test.

---

## 10. What to Build vs Not

### Implemented in v1.0

- Admin login, password change, security-question recovery
- Customer CRUD, pagination, search, photos
- Cash In / Cash Out / transfers
- Settings (language, pagination, currencies, company, theme, exchange toggle)
- PDF/Excel reports with RTL support
- Excel import with preview
- Full-system backup, auto-close backup, pre-login restore
- Windows installer (`FMT-Setup.exe`) with FMT branding/icon
- Localization: English, Dari, Pashto

### Deferred (v1.1+)

- Online in-app update system
- Backup encryption
- FTS5 search
- Code signing (operational)

### Must NOT Build

- Audit Log
- MongoDB / cloud accounting DB
- Multi-user RBAC (v1.0)
- Cloud sync of accounting data

---

## 11. Success Criteria

Implementation is correct when:

- A non-technical user can install from `FMT-Setup.exe` and use the app
- Data persists across restarts, backups, and restores
- Dari and Pashto PDFs render readable RTL text
- Import errors are visible; no silent corruption
- App works fully offline for core features
- Automated `typecheck` / `test` / `build:win` pass before release claims
