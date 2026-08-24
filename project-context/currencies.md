# Currencies

Multi-currency support, calculation rules, and extensibility for **FMT**.

Settings supports adding currencies and deactivating / reactivating them without rewriting core balance logic.

---

## 1. Overview

The application supports independent multi-currency accounting. Each currency is tracked separately — **never mix currencies in calculations**.

### Initial Currencies

| Code | Name (i18n key) | Symbol |
|------|-----------------|--------|
| AFN | `currency.afn` | ؋ |
| USD | `currency.usd` | $ |
| EUR | `currency.eur` | € |

---

## 2. Core Rules

### Rule 1: Independent Calculation

Each currency balance is calculated independently:

```
Balance(AFN) = CashIn(AFN) - CashOut(AFN)
Balance(USD) = CashIn(USD) - CashOut(USD)
Balance(EUR) = CashIn(EUR) - CashOut(EUR)
```

### Rule 2: No Cross-Currency Math

**Forbidden operations:**
- Adding AFN + USD balances
- Converting between currencies inside the ledger (no automatic FX postings)
- Showing a single "total balance" across currencies on main page

A Settings-controlled **exchange calculator** on the main page may convert an amount using a **manually entered** rate (Decimal.js). It does not fetch rates from the internet and does not write transactions. Default: disabled.

**Required display:**
- Separate totals: Total AFN, Total USD, Total EUR
- Separate columns in customer list
- Separate sections in reports

### Rule 3: Zero Default

If a customer has no transactions in a currency, display balance `0` (not blank, not N/A).

If no customers exist, global totals are `0` for all currencies.

### Rule 4: Transaction Currency Binding

Each transaction belongs to exactly one currency. A transaction cannot span multiple currencies.

---

## 3. Currency Registry

Stored in `currencies` table — see `database.md`.

| Column | Purpose |
|--------|---------|
| `code` | ISO-like code (AFN, USD, EUR) |
| `name_key` | i18n translation key |
| `symbol` | Display symbol |
| `is_active` | Whether available for new transactions |
| `sort_order` | Display order in UI |

UI reads active currencies dynamically — **do not hardcode currency list in components**.

```typescript
// Pseudocode
const currencies = await currencyService.getActive();
// Render columns, dropdowns, summary cards from this list
```

---

## 4. Display Formatting

| Currency | Decimal Places | Example |
|----------|----------------|---------|
| AFN | 2 (default) | 1,250,000.00 ؋ |
| USD | 2 | $3,500.00 |
| EUR | 2 | €1,200.50 |

Use `Intl.NumberFormat` with locale from current language setting.

For RTL languages, currency symbol placement follows locale conventions.

---

## 5. Main Page Totals

```
Total AFN = Σ Balance(AFN) for all customers
Total USD = Σ Balance(USD) for all customers
Total EUR = Σ Balance(EUR) for all customers
```

Computed on each customer list load. Cached optionally with invalidation on transaction change.

---

## 6. Customer List Columns

For each **active currency**, show one balance column:

| Name | AFN | USD | EUR | Cash In (#) | Cash Out (#) |
|------|-----|-----|-----|-------------|--------------|

When new currency added → new column appears automatically.

---

## 7. Customer Detail Summary

For each active currency, show card/section:

- Total Cash In (green)
- Total Cash Out (red)
- Balance
- (Optional per-currency transaction counts)

---

## 8. Reports

Each report section handles currencies separately:

```
Currency: AFN
  Cash In Total:    xxx
  Cash Out Total:   xxx
  Balance:          xxx

Currency: USD
  Cash In Total:    xxx
  ...
```

If no transactions for a currency in report scope → show 0 for all metrics.

See `reports.md`.

---

## 9. Adding New Currencies (Settings)

Architecture must support adding currencies without rewriting core logic.

### Flow (v1.0 or v1.1)

1. Settings → Currencies → Add Currency
2. Enter: Code (3-5 chars uppercase), i18n name (or select preset), symbol
3. Insert into `currencies` table with `is_active = 1`
4. Add i18n entries for name key
5. UI automatically shows new currency in dropdowns, columns, reports

### Constraints

- Currency codes must be unique. Adding an inactive code reactivates the existing row instead of inserting a duplicate.
- Settings provides **Reactivate** for inactive currencies and **Delete** for removal.
- Unused currencies (no historical transactions) may be permanently deleted.
- Currencies referenced by historical transactions cannot be hard-deleted. The admin can deactivate them instead. Transactions, customers, and other currencies are never deleted as a side effect.
- The last remaining active currency cannot be deactivated or deleted.

### Core Logic Changes Required

**None** — if implemented correctly:
- Balance queries GROUP BY `currency_code`
- UI renders from `currencies` table
- Reports iterate active + historical currencies

---

## 10. Import Validation

Excel import must validate currency column:

- Must match active currency code exactly (case-insensitive compare, store uppercase)
- Unknown currency → row error, not imported

See `import-export.md`.

---

## 11. Backup / Restore

`currencies` table included in backup. Restored system preserves currency configuration.

---

## 12. IPC API

### `currencies:list`

**Output:**
```typescript
Array<{
  code: string;
  nameKey: string;
  symbol: string;
  isActive: boolean;
  sortOrder: number;
}>
```

### `currencies:create` (Settings)

**Input:** `{ code, nameKey, symbol, sortOrder? }`

### `currencies:deactivate`

**Input:** `{ code }`

### `currencies:reactivate`

**Input:** `{ code }`

Reactivates an existing inactive currency. Idempotent if already active. Does not create a second row for the same code.

### `currencies:delete`

**Input:** `{ code }`

Permanently deletes the currency row only when no transactions reference it. If historical transactions exist, the request fails with `CURRENCY_IN_USE` and history is left unchanged.

---

## 13. i18n Keys

```
currency.afn     → "Afghan Afghani" / Dari / Pashto translations
currency.usd     → "US Dollar"
currency.eur     → "Euro"
currency.add
currency.code
currency.symbol
currency.deactivate
currency.hasTransactions
```

---

## 14. Testing Checklist

- [ ] AFN transaction does not affect USD balance
- [ ] Customer with only AFN transactions shows USD=0, EUR=0
- [ ] Global totals sum correctly per currency
- [ ] New currency appears in UI after adding via Settings
- [ ] Reports show separate sections per currency
- [ ] Import rejects invalid currency code
