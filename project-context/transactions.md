# Transactions

Cash In and Cash Out transaction management.

---

## 1. Overview

Transactions record money movement for a customer in a specific currency.

| Type | Visual Color | Database Value |
|------|--------------|----------------|
| Cash In | **GREEN** | `CASH_IN` |
| Cash Out | **RED** | `CASH_OUT` |

---

## 2. Transaction Fields

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| Customer | Yes | FK | Implicit from context |
| Type | Yes | Enum | CASH_IN or CASH_OUT |
| Amount | **Yes** | Decimal | Must be > 0 |
| Currency | **Yes** | Enum | AFN, USD, EUR (extensible) |
| Date | Yes | DateTime | Default: current local date and time |
| Note | No | Text | Unlimited length (SQLite TEXT) |

### Amount Validation

- Required — reject empty or zero
- Must be positive number
- Max precision: 4 decimal places
- Store as decimal string in database
- Use decimal library for calculations — never raw float
- Amount input accepts **English/Latin digits `0-9` only**, plus the application's decimal point (`.`)
- Dari/Persian/Arabic numerals and letters are not accepted; invalid characters are blocked on input/paste, not only after submit
- Amount field remains `dir="ltr"`; Notes and other text fields are unrestricted

### Balance rules

- **Transfers:** insufficient source balance is rejected inside the SQLite transaction (both legs roll back).
- **Cash Out / edit:** may produce a **negative customer balance** unless a future business rule adds a gate. Automated tests document this behavior.

### Currency Validation

- Must be active currency in `currencies` table
- Invalid currency → localized validation error

### Note Field

- Optional
- Multiline textarea in UI
- **No small character limit** — support extremely large notes (essays, long descriptions)
- SQLite supports up to ~1 GB per TEXT field
- List view: truncate display with expand/tooltip; detail and exports show full text
- Reports: wrap text within column; do not overflow into adjacent columns

---

## 3. Create Transaction

### Entry Points

- Customer detail page → **Add Transaction** button
- (Optional) Quick action from customer list

### Form Behavior

1. Type selector defaults to Cash In
2. Selecting Cash In → green accent on form
3. Selecting Cash Out → red accent on form
4. Amount field focused after type selection
5. Currency dropdown shows active currencies
6. Date and time default to the current local date and time; the user does not enter them when creating a transaction
7. Submit → validate → insert → refresh balances and list

Stored value: SQLite `TEXT` datetime (`YYYY-MM-DD HH:MM:SS`, local wall-clock). The existing `transaction_date` column already holds date and time; no extra migration is required.

Displayed value: locale-formatted date and time with Latin digits.

### Customer-to-customer transfer

A transfer is **two ledger rows** sharing one `transfer_id`:

| Leg | Customer | Type | Role |
|-----|----------|------|------|
| Source | From customer | `CASH_OUT` | `OUT` |
| Destination | To customer | `CASH_IN` | `IN` |

Balances stay computed as Cash In − Cash Out. Transfers require sufficient source balance. Both legs are inserted in one SQLite transaction and rolled back together if either insert fails. Transfer legs are not individually editable; delete removes both legs.

UI: Transfer action on the customer list and customer detail. History shows Transfer out / Transfer in plus the counterparty name.

Reports use the same ledger rows and label transfer legs as Transfer in / Transfer out.

### Post-Create

- Transaction appears at top of history (newest first by default)
- Customer list balances update
- Main page global totals update

---

## 4. Transaction List

Displayed on customer detail page.

### Columns

| Column | Notes |
|--------|-------|
| Date | Locale-formatted date and time |
| Type | Badge: green "Cash In" / red "Cash Out" |
| Currency | AFN / USD / EUR |
| Amount | Formatted; color matches type |
| Note | Truncated with expand |
| Actions | Delete |

### Sort Order

Default: `transaction_date DESC, id DESC` (newest first)

### Readability Rules

- Alternating row backgrounds (subtle)
- Adequate column widths
- Fixed header on scroll (optional)
- Type badges always colored (green/red)

---

## 5. Pagination

### When to Paginate

- When customer has **more than 10 transactions** AND pagination is **enabled** in Settings
- When pagination disabled: show all with scroll container (max height with overflow)

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `pagination_enabled` | `true` | Toggle in Settings → Transactions |
| `pagination_page_size` | `10` | Rows per page |

### UI Controls

- Previous / Next buttons
- Page indicator: "Page 1 of 5"
- Optional: rows per page selector (10, 25, 50) — future

### Implementation

Server-side pagination via IPC:

```
transactions:list({ customerId, page, pageSize })
→ { rows, totalCount, totalPages }
```

---

## 6. Edit Transaction

1. User clicks Edit on transaction row (or edit action in detail view)
2. Form opens pre-filled with type, amount, currency, date and time, and note
3. User may edit **both date and time** (as well as the other fields) and submits
4. Main process validates (same rules as create) and updates the row
5. Balances recalculated on read
6. List, customer detail, and global totals refresh

**Rules:**
- Amount, currency, and type remain required
- Note remains optional with unlimited length
- Cash In / Cash Out color accents apply in the edit form as in create
- UI must confirm destructive navigation away from unsaved edits (optional v1.0)

---

## 7. Delete Transaction

1. User clicks Delete on transaction row
2. **Confirmation required** — dialog with amount, type, date summary
3. On confirm: DELETE row
4. Balances recalculated on read
5. List and global totals refresh

**Never** delete without confirmation.

---

## 8. Balance Impact

Each transaction affects **one currency only**.

```
AFN Balance = SUM(CASH_IN amounts where currency=AFN) - SUM(CASH_OUT amounts where currency=AFN)
```

Same formula independently for USD and EUR.

See `currencies.md` — never cross-currency math.

---

## 9. Customer Detail Summary

Customer detail shows aggregated metrics per currency:

| Metric | Calculation |
|--------|-------------|
| Total Cash In (AFN) | SUM amount WHERE type=CASH_IN AND currency=AFN |
| Total Cash Out (AFN) | SUM amount WHERE type=CASH_OUT AND currency=AFN |
| AFN Balance | Total Cash In − Total Cash Out |
| Cash In Count | COUNT WHERE type=CASH_IN (all currencies combined on detail) |
| Cash Out Count | COUNT WHERE type=CASH_OUT (all currencies combined on detail) |

**Note:** Counts on main list are total across all currencies. Per-currency counts shown in currency summary cards on detail.

---

## 10. IPC API

### `transactions:create`

**Input:**
```typescript
{
  sessionId: string;
  customerId: number;
  type: 'CASH_IN' | 'CASH_OUT';
  amount: string;
  currencyCode: string;
  transactionDate?: string;  // ISO8601
  note?: string;
}
```

**Output:** `{ success: true, transactionId: number }` or validation errors

### `transactions:update`

**Input:**
```typescript
{
  sessionId: string;
  transactionId: number;
  type: 'CASH_IN' | 'CASH_OUT';
  amount: string;
  currencyCode: string;
  transactionDate?: string;  // ISO8601
  note?: string;
}
```

**Output:** `{ success: true }` or validation errors

**Behavior:** Updates existing transaction row; recalculates balances on read.

### `transactions:delete`

**Input:** `{ sessionId, transactionId }`

**Output:** `{ success: true }`

### `transactions:list`

**Input:** `{ sessionId, customerId, page?, pageSize? }`

**Output:**
```typescript
{
  transactions: Array<{
    id: number;
    type: 'CASH_IN' | 'CASH_OUT';
    currencyCode: string;
    amount: string;
    note: string | null;
    transactionDate: string;
  }>;
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
```

---

## 11. Validation Error Codes

| Code | Key |
|------|-----|
| `AMOUNT_REQUIRED` | `transaction.error.amountRequired` |
| `AMOUNT_INVALID` | `transaction.error.amountInvalid` |
| `CURRENCY_REQUIRED` | `transaction.error.currencyRequired` |
| `CURRENCY_INVALID` | `transaction.error.currencyInvalid` |
| `CUSTOMER_NOT_FOUND` | `transaction.error.customerNotFound` |

---

## 12. Report and Export Inclusion

Transactions included in reports with:
- Customer name and number
- Type (Cash In / Cash Out)
- Currency
- Amount
- Date
- Note (where appropriate)

See `reports.md`.

---

## 13. Import

Transactions may be bulk-imported from Excel — see `import-export.md`.

Imported transactions follow same validation rules as manual entry.

---

## 14. Edge Cases

| Case | Behavior |
|------|----------|
| Amount with many decimals | Round or reject beyond 4 decimal places |
| Future date | Allow (backdating/postdating permitted) |
| Empty note | Store NULL |
| Very long note | Store fully; UI truncates in table only |
| Delete last transaction | Balances return to 0 |
