# Requirements

Functional and non-functional requirements for the Customer Accounting desktop application.

---

## 1. Product Overview

| Attribute | Requirement |
|-----------|-------------|
| Product type | Offline desktop customer accounting application |
| Target user | Non-technical administrator / business owner |
| Platform | Windows 10/11 (64-bit) for v1.0 |
| Distribution | Single installer: `CustomerAccounting-Setup.exe` |
| Database | SQLite (local, embedded) |
| Network | Offline during normal operation; online only for optional app updates |

---

## 2. Installation Requirements

| ID | Requirement |
|----|-------------|
| INST-01 | Customer receives ONE installer file |
| INST-02 | Customer must NOT install Node.js, MongoDB, Python, npm, Git, or any dev tool |
| INST-03 | After install, user can launch from Desktop or Start Menu shortcut |
| INST-04 | First launch shows login OR "Import Existing System" option |
| INST-05 | Application files and user data must be stored in separate directories |
| INST-06 | Uninstall must not delete user data by default |

---

## 3. Authentication Requirements

| ID | Requirement |
|----|-------------|
| AUTH-01 | Single administrator account |
| AUTH-02 | Default username: `admin` |
| AUTH-03 | Default password: `admin123` |
| AUTH-04 | Credentials must NOT be changed automatically on install or update |
| AUTH-05 | Password stored as secure hash, never plaintext |
| AUTH-06 | Login form must disable browser-style autofill |
| AUTH-07 | Admin has full application access |
| AUTH-08 | Admin system extensible through Settings (e.g., password change in future) |

---

## 4. Main Page Requirements

| ID | Requirement |
|----|-------------|
| MAIN-01 | After login, show customer list — NOT a traditional dashboard |
| MAIN-02 | Top of page shows total amounts across ALL customers, separately per currency |
| MAIN-03 | Display Total AFN, Total USD, Total EUR |
| MAIN-04 | If a currency total is zero, display `0` |
| MAIN-05 | Customer list columns: Name, Customer Number, AFN balance, USD balance, EUR balance, Cash In count, Cash Out count |
| MAIN-06 | Admin can edit customer inline or via edit action from list |
| MAIN-07 | Delete customer requires explicit confirmation |

---

## 5. Customer Requirements

| ID | Requirement |
|----|-------------|
| CUST-01 | Add customer fields: Name, Customer Number, Profile Photo — all optional |
| CUST-02 | Saved customer appears immediately in main list |
| CUST-03 | Customer detail view shows full info and transaction history |
| CUST-04 | Customer detail shows per-currency: Total Cash In, Total Cash Out, Balance, Cash In count, Cash Out count |
| CUST-05 | Profile photo stored locally and included in backups |

See `customers.md` for detailed behavior.

---

## 6. Transaction Requirements

| ID | Requirement |
|----|-------------|
| TXN-01 | Types: Cash In, Cash Out |
| TXN-02 | Cash In displayed in GREEN |
| TXN-03 | Cash Out displayed in RED |
| TXN-04 | Amount: REQUIRED |
| TXN-05 | Currency: REQUIRED (AFN, USD, EUR initially) |
| TXN-06 | Note: optional, supports very large text (no arbitrary small limit) |
| TXN-07 | Transaction list clean and readable |
| TXN-08 | Pagination when > 10 transactions (configurable in Settings) |
| TXN-09 | Delete transaction requires explicit confirmation |

See `transactions.md` for detailed behavior.

---

## 7. Currency Requirements

| ID | Requirement |
|----|-------------|
| CUR-01 | Initial currencies: AFN, USD, EUR |
| CUR-02 | Each currency calculated independently — never mix mathematically |
| CUR-03 | Balance formula per currency: Cash In − Cash Out |
| CUR-04 | Architecture must allow adding currencies from Settings without rewriting core logic |
| CUR-05 | Zero balance displayed when no transactions exist for a currency |

See `currencies.md`.

---

## 8. Report Requirements

| ID | Requirement |
|----|-------------|
| RPT-01 | Export formats: PDF, Excel (XLSX) |
| RPT-02 | Proper table structure; no data overflow between columns/sections |
| RPT-03 | Report types: individual customer, all customers, date range, transaction, currency summary |
| RPT-04 | Include: Cash In totals, Cash Out totals, balances, transaction counts, customer counts |
| RPT-05 | Per currency: separate Cash In, Cash Out, Balance (0 if none) |
| RPT-06 | Include customer name, number, counts, currency, amount, date, note where appropriate |
| RPT-07 | Dari and Pashto PDF must be readable RTL with proper shaping |
| RPT-08 | English PDF remains LTR |

See `reports.md`.

---

## 9. Import / Export Requirements

| ID | Requirement |
|----|-------------|
| IMP-01 | Import customer and transaction data from Excel |
| IMP-02 | Validate structure, required fields, currencies, amounts |
| IMP-03 | Detect duplicates where appropriate |
| IMP-04 | Report invalid rows; never silent failure |
| IMP-05 | Show import preview before commit |
| IMP-06 | Allow cancel |
| IMP-07 | Atomic commit; never partially destroy existing data |
| IMP-08 | Exact Excel format documented in `import-export.md` |

---

## 10. Backup / Restore Requirements

| ID | Requirement |
|----|-------------|
| BAK-01 | Full system backup including DB, customers, transactions, admin, settings, currencies, localization, metadata, profile images |
| BAK-02 | Dedicated backup format: `CustomerAccounting_Backup_YYYY-MM-DD.cab` |
| BAK-03 | Backup portable across installations |
| BAK-04 | New install offers "Import Existing System" before login |
| BAK-05 | Validate backup before restore; show date, customer count, transaction count, app version |
| BAK-06 | Explicit user confirmation before restore |
| BAK-07 | Create safety backup of existing data before destructive restore |
| BAK-08 | Never silently overwrite important data |

See `backup-restore.md`.

---

## 11. Update Requirements

| ID | Requirement |
|----|-------------|
| UPD-01 | Application supports online updates (update server only) |
| UPD-02 | Normal operation remains offline |
| UPD-03 | Customer data stays local — never cloud database |
| UPD-04 | Update must preserve SQLite DB, images, settings, admin credentials |
| UPD-05 | Update must NEVER delete existing customer data |
| UPD-06 | Safe SQLite schema migration strategy documented |

See `update-system.md`.

---

## 12. Localization Requirements

| ID | Requirement |
|----|-------------|
| LOC-01 | Languages: Dari, Pashto, English |
| LOC-02 | Dari and Pashto: RTL |
| LOC-03 | English: LTR |
| LOC-04 | Entire UI localized — no hardcoded strings |
| LOC-05 | RTL/LTR in forms, tables, buttons, dialogs, reports, PDF, Excel, navigation, errors |

See `localization.md`.

---

## 13. Security Requirements

| ID | Requirement |
|----|-------------|
| SEC-01 | Password hashing (bcrypt or equivalent) |
| SEC-02 | Session handling documented |
| SEC-03 | Input validation on all user input |
| SEC-04 | File upload validation (profile photos) |
| SEC-05 | Import and backup file validation |
| SEC-06 | Update package verification (signature/checksum) |
| SEC-07 | Protection against malicious backup/import files |

See `security.md`.

---

## 14. UI/UX Requirements

| ID | Requirement |
|----|-------------|
| UX-01 | Professional, modern, clean design |
| UX-02 | Easy to learn for non-technical users |
| UX-03 | Fast and responsive within desktop window |
| UX-04 | Clear visual hierarchy |
| UX-05 | Destructive actions require confirmation |

See `ui-ux.md`.

---

## 15. Explicit Exclusions

| Item | Status |
|------|--------|
| Audit Log | **REMOVED — DO NOT IMPLEMENT** |
| MongoDB | **FORBIDDEN** |
| Cloud database for accounting data | **FORBIDDEN** |
| Multi-user RBAC (v1.0) | Out of scope |
| Mobile app | Out of scope |

---

## 16. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-01 | Offline-first: all core features work without internet |
| NFR-02 | Data integrity: ACID transactions for critical operations |
| NFR-03 | Maintainability: modular architecture per `architecture.md` |
| NFR-04 | Recoverability: backup/restore + crash recovery |
| NFR-05 | Localizable: centralized i18n |
| NFR-06 | Testable: comprehensive test strategy in `testing.md` |

---

## 17. Acceptance Criteria (High Level)

The application is acceptable for v1.0 release when:

1. Installer works on clean Windows 10/11 without prerequisites
2. Default admin login succeeds
3. Customer and transaction CRUD works for all three currencies
4. Main page totals match sum of customer balances per currency
5. PDF reports render Dari/Pashto RTL correctly
6. Excel import shows preview and rejects bad rows visibly
7. Backup restores completely on fresh install via "Import Existing System"
8. Application update preserves all user data (when update feature ships)
9. All UI strings available in EN, Dari, Pashto
10. No audit log feature present
