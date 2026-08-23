# Testing Strategy

Comprehensive test plan for Customer Accounting desktop application.

---

## 1. Overview

| Level | Tool | Scope |
|-------|------|-------|
| Unit | Vitest | Services, validators, calculations |
| Integration | Vitest + in-memory SQLite | Repositories, migrations |
| Component | React Testing Library | UI components |
| E2E | Playwright (Electron) | Full user flows |
| Manual | Checklist | Installer, RTL PDF, OS integration |

**Test every major change** per `AI_INSTRUCTIONS.md`.

---

## 2. Test Environment

| Environment | Purpose |
|-------------|---------|
| Dev machine | Unit, integration, component |
| Clean Windows 10/11 VM | Installer, E2E, uninstall |
| VM with Dari/Pashto locale | RTL UI verification |

### Test Data

- Seed script with known customers and transactions
- Separate fixtures for import Excel files (valid, invalid, edge cases)
- Sample backup `.cab` files (valid, corrupted, wrong version)

---

## 3. Authentication Tests

| ID | Test Case | Expected |
|----|-----------|----------|
| AUTH-T01 | Login with admin/admin123 | Success, navigate to customer list |
| AUTH-T02 | Login with wrong password | Error message, stay on login |
| AUTH-T03 | Login with wrong username | Error message, stay on login |
| AUTH-T04 | Login form has no autofill | autocomplete off on fields |
| AUTH-T05 | Logout | Return to login, session invalidated |
| AUTH-T06 | Access protected route without session | Redirect to login |
| AUTH-T07 | Session expires after idle | Prompt re-login |
| AUTH-T08 | Default admin exists on fresh install | admin/admin123 works |
| AUTH-T09 | Password stored as hash | DB contains bcrypt hash, not plaintext |
| AUTH-T10 | Change password with correct current password | New password works; old password fails; sessions cleared |
| AUTH-T11 | Change password with wrong current password | Error; password unchanged |
| AUTH-T12 | New password policy / mismatch / unchanged | Localized validation error |
| AUTH-T13 | Recovery hint stored hashed | Answer is bcrypt, never plaintext |
| AUTH-T14 | Recover with correct hint | Password reset; old password fails |
| AUTH-T15 | Recover with wrong username or answer | Generic `RECOVERY_FAILED` |

---

## 4. Customer Tests

| ID | Test Case | Expected |
|----|-----------|----------|
| CUST-T01 | Create customer with all fields | Appears in list |
| CUST-T02 | Create customer with no fields | Appears with "(No Name)" fallback |
| CUST-T03 | Edit customer name from list | Updated in list |
| CUST-T04 | Upload profile photo | Thumbnail displayed |
| CUST-T05 | Upload invalid file type | Error, no partial save |
| CUST-T06 | Upload oversized photo (>5MB) | Error |
| CUST-T07 | Delete customer with confirmation | Removed from list |
| CUST-T08 | Delete customer cancel | No change |
| CUST-T09 | Delete customer cascades transactions | Transactions gone |
| CUST-T10 | Customer detail shows all currency balances | Correct values |
| CUST-T11 | Main list shows all required columns | Name, number, 3 balances, 2 counts |

---

## 5. Transaction Tests

| ID | Test Case | Expected |
|----|-----------|----------|
| TXN-T01 | Create Cash In AFN | Green display, balance increases |
| TXN-T02 | Create Cash Out AFN | Red display, balance decreases |
| TXN-T03 | Create transaction USD | Only USD balance affected |
| TXN-T04 | Create transaction EUR | Only EUR balance affected |
| TXN-T05 | Amount required validation | Error if empty |
| TXN-T06 | Amount zero validation | Error |
| TXN-T07 | Currency required validation | Error if not selected |
| TXN-T08 | Note optional — empty allowed | Transaction saved |
| TXN-T09 | Large note (100KB+ text) | Saved fully, retrievable |
| TXN-T10 | Delete transaction with confirmation | Removed, balance updated |
| TXN-T11 | Delete transaction cancel | No change |
| TXN-T12 | Transaction list newest first | Correct sort order |
| TXN-T13 | Transfer A→B with sufficient balance | Source down, destination up; two ledger rows share `transfer_id` |
| TXN-T14 | Transfer insufficient balance | Error; no rows written |
| TXN-T15 | Transfer same customer | Error |
| TXN-T16 | Transfer pair insert failure | Both legs rolled back |

---

## 6. Currency Calculation Tests

| ID | Test Case | Expected |
|----|-----------|----------|
| CUR-T01 | AFN balance = Cash In - Cash Out | Correct |
| CUR-T02 | USD independent of AFN | AFN txn doesn't change USD |
| CUR-T03 | No AFN transactions | AFN balance shows 0 |
| CUR-T04 | Main page Total AFN | Sum of all customer AFN balances |
| CUR-T05 | Main page Total USD | Sum of all customer USD balances |
| CUR-T06 | Main page Total EUR | Sum of all customer EUR balances |
| CUR-T07 | Empty app totals | All totals 0 |
| CUR-T08 | Never mix currencies | No combined total displayed |

---

## 7. Pagination Tests

| ID | Test Case | Expected |
|----|-----------|----------|
| PAG-T01 | 10 or fewer transactions, pagination on | All visible or paginated per setting |
| PAG-T02 | 15 transactions, pagination on | Page 1 shows 10, page 2 shows 5 |
| PAG-T03 | Pagination disabled in settings | All transactions scroll |
| PAG-T04 | Toggle pagination in settings | Behavior changes immediately |

---

## 8. Main Page Tests

| ID | Test Case | Expected |
|----|-----------|----------|
| MAIN-T01 | After login, customer list shown | Not a dashboard |
| MAIN-T02 | Totals bar visible | AFN, USD, EUR totals |
| MAIN-T03 | Zero currency total displays 0 | Not blank |
| MAIN-T04 | Totals update after transaction | Reflect new amounts |

---

## 9. Report Tests

| ID | Test Case | Expected |
|----|-----------|----------|
| RPT-T01 | Individual customer PDF | Correct data, table structure |
| RPT-T02 | All customers PDF | All rows, no overflow |
| RPT-T03 | Date range report | Only transactions in range |
| RPT-T04 | Currency summary | Separate AFN/USD/EUR sections |
| RPT-T05 | Zero currency in report | Shows 0 |
| RPT-T06 | Excel export opens in Excel | Valid XLSX |
| RPT-T07 | Long note in report | Wraps within column |
| RPT-T08 | PDF English LTR | Correct alignment |
| RPT-T09 | PDF Dari RTL | Readable shaped Arabic script |
| RPT-T10 | PDF Pashto RTL | Readable shaped Arabic script |
| RPT-T11 | Excel Dari headers | RTL sheet, correct text |
| RPT-T12 | Cash In green, Cash Out red in report | Color applied |

---

## 10. Localization Tests

| ID | Test Case | Expected |
|----|-----------|----------|
| LOC-T01 | Switch to Dari | All UI text changes |
| LOC-T02 | Switch to Pashto | All UI text changes |
| LOC-T03 | Switch to English | All UI text changes |
| LOC-T04 | Dari RTL layout | Mirrored navigation, start alignment |
| LOC-T05 | Pashto RTL layout | Mirrored layout |
| LOC-T06 | English LTR layout | Standard layout |
| LOC-T07 | No hardcoded strings | Grep/lint passes |
| LOC-T08 | Error messages localized | All languages |
| LOC-T09 | Numbers formatted per locale | Correct separators |

---

## 11. Import Tests

| ID | Test Case | Expected |
|----|-----------|----------|
| IMP-T01 | Valid Excel import | Preview then commit succeeds |
| IMP-T02 | Invalid currency row | Row error shown with row number |
| IMP-T03 | Invalid amount row | Row error shown |
| IMP-T04 | Missing required header | Structure error |
| IMP-T05 | Cancel import at preview | No DB changes |
| IMP-T06 | Commit failure rolls back | No partial data |
| IMP-T07 | Duplicate customer in sheet | Error on duplicate row |
| IMP-T08 | UTF-8 Dari/Pashto in notes | Preserved correctly |
| IMP-T09 | Import preview shows counts | Valid/invalid counts correct |
| IMP-T10 | Empty file | Error, no crash |

---

## 12. Backup / Restore Tests

| ID | Test Case | Expected |
|----|-----------|----------|
| BAK-T01 | Create backup | Valid .cab file produced |
| BAK-T02 | Backup contains DB + images | Manifest lists all files |
| BAK-T03 | Restore on fresh install (pre-login) | Full data restored |
| BAK-T04 | Restore shows metadata | Date, counts, version |
| BAK-T05 | Restore requires confirmation | No restore without confirm |
| BAK-T06 | Restore over existing data | Safety backup created first |
| BAK-T07 | Corrupted backup rejected | Error message |
| BAK-T08 | Invalid archive rejected | Error message |
| BAK-T09 | Path traversal in archive | Rejected |
| BAK-T10 | Admin login works after restore | Credentials from backup |
| BAK-T11 | Cancel restore | No changes |

---

## 13. Update Tests

| ID | Test Case | Expected |
|----|-----------|----------|
| UPD-T01 | Update preserves database | Customer count unchanged |
| UPD-T02 | Update preserves images | Photos still display |
| UPD-T03 | Update preserves settings | Language, pagination unchanged |
| UPD-T04 | Update preserves admin credentials | Same login works |
| UPD-T05 | Schema migration forward | New schema applied |
| UPD-T06 | Migration failure recovery | Safety backup restored |
| UPD-T07 | Invalid update checksum rejected | Not installed |
| UPD-T08 | Offline update check | Friendly error, app works |

---

## 14. Installer / Uninstaller Tests

| ID | Test Case | Expected |
|----|-----------|----------|
| INS-T01 | Install on clean Windows VM | Success from single exe |
| INS-T02 | Desktop shortcut created | Launches app |
| INS-T03 | Start Menu shortcut created | Launches app |
| INS-T04 | No Node.js on VM required | App works |
| INS-T05 | User data in AppData | Not in Program Files |
| INS-T06 | Update install preserves AppData | Data intact |
| INS-T07 | Uninstall keep data | AppData preserved |
| INS-T08 | Uninstall remove all (confirmed) | AppData deleted |
| INS-T09 | Reinstall after uninstall (keep data) | Existing data accessible |

---

## 15. Data Preservation Tests

| ID | Test Case | Expected |
|----|-----------|----------|
| DATA-T01 | App restart | All data persists |
| DATA-T02 | OS reboot | All data persists |
| DATA-T03 | Update | All data persists |
| DATA-T04 | Backup + restore cycle | Identical data |
| DATA-T05 | Import does not delete existing | Original data + imported |

---

## 16. Crash Recovery Tests

| ID | Test Case | Expected |
|----|-----------|----------|
| CRASH-T01 | Kill app during transaction save | Data consistent on restart (WAL) |
| CRASH-T02 | Kill app during backup | No corrupted DB; partial backup discarded |
| CRASH-T03 | Unclean shutdown detection | Logged, integrity check runs |

---

## 17. Security Tests

| ID | Test Case | Expected |
|----|-----------|----------|
| SEC-T01 | SQL injection in customer name | Safely handled |
| SEC-T02 | Invalid session on IPC | Rejected |
| SEC-T03 | Oversized import file | Rejected |
| SEC-T04 | Non-image uploaded as photo | Rejected |

---

## 18. Settings Tests

| ID | Test Case | Expected |
|----|-----------|----------|
| SET-T01 | Toggle pagination | Saved and applied |
| SET-T02 | Change language | Saved and applied |
| SET-T03 | Settings persist restart | Values retained |

---

## 19. Explicit Non-Tests

| Feature | Status |
|---------|--------|
| Audit Log | Must NOT exist — verify absence |
| MongoDB | Must NOT exist |
| Cloud sync | Must NOT exist |

---

## 20. Test Automation Structure

```
tests/
├── unit/
│   ├── currencyCalculator.test.ts
│   ├── importValidator.test.ts
│   └── backupManifest.test.ts
├── integration/
│   ├── customerRepository.test.ts
│   ├── migration.test.ts
│   └── importCommit.test.ts
├── component/
│   ├── CustomerTable.test.tsx
│   └── TransactionForm.test.tsx
├── e2e/
│   ├── login.spec.ts
│   ├── customer-flow.spec.ts
│   ├── backup-restore.spec.ts
│   └── import.spec.ts
└── fixtures/
    ├── import-valid.xlsx
    ├── import-invalid.xlsx
    └── backup-valid.cab
```

---

## 21. Release Acceptance Criteria

Before v1.0 release, ALL test categories must pass:

- [ ] Authentication (100%)
- [ ] Customer CRUD (100%)
- [ ] Transactions (100%)
- [ ] Currency calculations (100%)
- [ ] Main page (100%)
- [ ] Reports including Dari/Pashto PDF (100%)
- [ ] Import (100%)
- [ ] Backup/Restore (100%)
- [ ] Installer on clean VM (100%)
- [ ] Localization RTL/LTR (100%)
- [ ] No audit log present (verified)

Update tests may be deferred to v1.1 if update feature not shipped — document in changelog.

---

## 22. Regression Policy

Any bug fix must include a test that would have caught the bug.

Any schema change must include migration test against sample database.
