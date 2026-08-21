# AI Development Instructions

**Read this file completely before writing any application code.**

This document defines mandatory rules for AI coding agents implementing the Customer Accounting desktop application. Violating these rules can cause data loss, security failures, or broken user experience.

---

## 1. Before You Code

1. **Read the relevant context files** in `project-context/` before implementing any feature. Start with `README.md`, then `requirements.md`, `architecture.md`, and the feature-specific document(s).
2. **Never guess requirements** when documentation already defines them. If something is ambiguous, document your assumption in code comments and update the relevant `.md` file.
3. **Follow the recommended implementation order** in `README.md` unless the user explicitly directs otherwise.

---

## 2. Scope and Change Discipline

4. **Never delete existing features** without explicit user approval.
5. **Never modify unrelated features** when implementing a requested change. Keep diffs focused.
6. **Never introduce MongoDB** or any cloud database for customer accounting data.
7. **Do not add an Audit Log system.** It has been explicitly removed from requirements.
8. **Do not add cloud dependencies** for normal application operation (auth, storage, sync). The update server is the only permitted online endpoint.
9. **Preserve backward compatibility** for backups, database schema, and import formats whenever possible.

---

## 3. Data Safety (Critical)

10. **Never destroy customer data** — not during migrations, imports, updates, or uninstalls.
11. **Never perform destructive database migrations** without a backup step and explicit migration plan documented in `database.md`.
12. **Preserve existing backups** — do not invalidate or overwrite user backup files.
13. **Never silently overwrite existing data** during import, restore, or update operations.
14. **Never silently discard failed Excel import rows** — all failures must be reported to the user.
15. **Use atomic transactions** for multi-row database writes (import commit, restore, bulk delete).
16. **Create a safety backup** before any destructive restore operation.

---

## 4. Authentication and Security

17. **Never change admin credentials automatically** — default username `admin` and password `admin123` must remain unless the user explicitly requests a change.
18. **Never store plaintext passwords** in the database or configuration files.
19. **Disable browser-style autofill** on the login form (`autocomplete="off"`, appropriate input attributes).
20. **Validate all external input** — Excel imports, backup files, uploaded images, update packages.

---

## 5. Localization and RTL

21. **Never hardcode localized text** into UI components. Use the centralized localization system defined in `localization.md`.
22. **Never assume Arabic-script PDF rendering works** by merely selecting a Unicode font. Dari and Pashto require proper text shaping, bidi (RTL) handling, and appropriate fonts — see `reports.md` and `localization.md`.

---

## 6. Application Architecture

23. **Keep application files and user data separate** — see `desktop-app.md` and `installer.md`.
24. **The application must remain offline-first** — all core features work without network access.
25. **Use SQLite** as the sole database. Do not replace it with another engine.
26. **Maintain modular separation** — UI, business logic, database, auth, reports, backup, restore, import, export, update system, and localization must remain decoupled per `architecture.md`.
27. **Never mix currencies mathematically** — AFN, USD, and EUR balances are calculated independently.

---

## 7. UI/UX Rules

28. **Cash In must always be GREEN.** Cash Out must always be RED. This is non-negotiable.
29. **Destructive actions require explicit confirmation** — delete customer, delete transaction, restore backup, commit import.
30. **The main page after login shows the customer list**, not a traditional dashboard.
31. **Do not show total amounts mixed across currencies** — show separate totals for AFN, USD, and EUR.

---

## 8. Testing and Documentation

32. **Test every major change** according to `testing.md`.
33. **Update documentation** when architecture or behavior changes.
34. **Update `changelog.md`** after implementing features or releasing versions.
35. **Follow `coding-rules.md`** for naming, structure, and conventions.

---

## 9. What to Build vs. What Not to Build

### Must Build (v1.0 scope)

- Admin login with default credentials
- Customer list as main page with currency totals
- Customer CRUD with optional fields and profile photo
- Cash In / Cash Out transactions (AFN, USD, EUR)
- Customer detail view with transaction history
- Settings (pagination toggle, language, future currency extensibility)
- PDF and Excel reports with RTL support
- Excel import with validation and preview
- Full system backup and restore (including pre-login restore)
- Windows installer with data separation
- Localization: English, Dari, Pashto

### May Defer (document in changelog if deferred)

- Online update system (architecture must be ready; implementation can ship in v1.1+)

### Must NOT Build

- Audit Log
- MongoDB or cloud database
- Multi-user / role-based access (v1.0)
- Cloud sync of accounting data
- Browser-based deployment as primary interface

---

## 10. When Stuck

1. Re-read the feature-specific document in `project-context/`.
2. Check `requirements.md` for the authoritative requirement.
3. Check `architecture.md` for the approved technology and module boundaries.
4. If still ambiguous, implement the safest option (preserve data, ask for confirmation, fail loudly on errors) and document the decision.

---

## 11. File Reference Quick Guide

| Task | Read First |
|------|------------|
| Project setup | `architecture.md`, `coding-rules.md`, `desktop-app.md` |
| Login | `authentication.md`, `security.md` |
| Customer list / main page | `customers.md`, `ui-ux.md`, `currencies.md` |
| Transactions | `transactions.md`, `currencies.md`, `database.md` |
| Reports | `reports.md`, `localization.md` |
| Excel import | `import-export.md` |
| Backup / restore | `backup-restore.md` |
| Updates | `update-system.md` |
| Installer | `installer.md`, `desktop-app.md` |
| Tests | `testing.md` |

---

## 12. Success Criteria

The implementation is correct when:

- A non-technical user can install from `CustomerAccounting-Setup.exe` and use the app immediately
- All data persists across app restarts, updates, and backup/restore cycles
- Dari and Pashto PDFs render readable RTL text
- Import errors are visible; no silent data corruption
- Application works fully offline except optional update checks
