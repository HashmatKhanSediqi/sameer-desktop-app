# Requirements

Functional and non-functional requirements for **FMT**.

---

## 1. Product Overview

| Attribute | Requirement |
|-----------|-------------|
| Product name | **FMT** |
| Product type | Offline desktop customer accounting application |
| Target user | Non-technical administrator / business owner |
| Platform | Windows 10/11 (64-bit) for v1.0 |
| Distribution | Single installer: `FMT-Setup.exe` |
| Database | SQLite (local, embedded) |
| Network | Offline during normal operation; optional internet for update check/download |

Compatibility paths such as `%APPDATA%\CustomerAccounting\` remain for existing installs — see `README.md`.

---

## 2. Installation Requirements

| ID | Requirement | v1.0 |
|----|-------------|------|
| INST-01 | Customer receives ONE installer file | Done |
| INST-02 | No Node.js/MongoDB/Python/npm/Git required | Done |
| INST-03 | Desktop and Start Menu shortcuts | Done (FMT) |
| INST-04 | First launch: login OR Import Existing System | Done |
| INST-05 | App files and user data separated | Done |
| INST-06 | Uninstall must not delete user data by default | Done |

---

## 3. Authentication Requirements

| ID | Requirement | v1.0 |
|----|-------------|------|
| AUTH-01 | Single administrator account | Done |
| AUTH-02 | Default username `admin` | Done |
| AUTH-03 | Default password `admin123` | Done |
| AUTH-04 | Credentials not auto-changed | Done |
| AUTH-05 | Password stored as secure hash | Done (bcrypt) |
| AUTH-06 | Login autofill disabled | Done |
| AUTH-07 | Admin full access | Done |
| AUTH-08 | Password change + recovery via Settings | Done |

---

## 4. Main Page Requirements

| ID | Requirement | v1.0 |
|----|-------------|------|
| MAIN-01 | After login, customer list (not dashboard) | Done |
| MAIN-02–04 | Per-currency totals across customers | Done |
| MAIN-05 | List columns: name, number, balances (counts on detail/reports) | Done — Cash In/Out count columns removed from list UI |
| MAIN-06 | Edit customer | Done |
| MAIN-07 | Delete requires confirmation | Done |
| MAIN-08 | Paginated customer list for large datasets | Done |
| MAIN-09 | Customer search (SQL) | Done — FTS5 not used |

---

## 5–12. Feature Requirement Summaries

See specialized docs; all core v1.0 requirements for customers, transactions (including transfers), currencies, reports, import/export, backup/restore, localization, and security are implemented.

Notable clarifications:

| Topic | Requirement clarification |
|-------|---------------------------|
| BAK-02 | Filename pattern is `FMT_Backup_YYYY-MM-DD.cab` |
| BAK-09 | Automatic backup on application close | Implemented — user-selected folder (v1.4.0) |
| BAK-10 | Safety backup retention (5); automatic close backups in the user folder are not pruned | Implemented |
| UPD-* | In-app updates | **Shipped in v1.0** (GitHub Releases; see `update-system.md`) |
| TXN balance gate | Transfers enforce insufficient balance; cash-out/edit may go negative | Documented limitation |

---

## 13. Explicit Exclusions

| Item | Status |
|------|--------|
| Audit Log | **REMOVED — DO NOT IMPLEMENT** |
| MongoDB | **FORBIDDEN** |
| Cloud database for accounting data | **FORBIDDEN** |
| Multi-user RBAC (v1.0) | Out of scope |
| Mobile app | Out of scope |
| Backup encryption (v1.0) | Out of scope — known risk |
| FTS5 search (v1.0) | Out of scope |

---

## 14. Non-Functional Requirements

| ID | Requirement | Notes |
|----|-------------|-------|
| NFR-01 | Offline-first | Done |
| NFR-02 | ACID for critical ops | Done |
| NFR-03 | Modular architecture | Done |
| NFR-04 | Recoverability | Backup/restore + WAL + integrity |
| NFR-05 | Localizable | EN / Dari / Pashto |
| NFR-06 | Testable | Vitest suite (198+ tests) |
| NFR-07 | Scale | Empirically validated at 100k customers / 300k transactions; **1M+ not validated** |

---

## 15. Acceptance Criteria (High Level)

Acceptable for **controlled** v1.0 release when:

1. Installer builds (`FMT-Setup.exe`) — automated verified
2. Default admin login works
3. Customer/transaction/transfer CRUD works for seeded currencies
4. Main page totals match per-currency sums
5. PDF/Excel reports generate; Dari/Pashto pipeline implemented (visual QA recommended)
6. Excel import preview + visible errors
7. Backup/restore including pre-login Import Existing System
8. Auto-close backup works
9. UI strings in EN, Dari, Pashto
10. No audit log
11. Known risks documented in `release-readiness.md`

Clean Windows VM manual install remains an operator checklist item.
