# Customers

Customer management: creation, listing, editing, deletion, and detail views.

---

## 1. Overview

Customers are the core entity. The **main page after login is the customer list**, not a dashboard.

All customer input fields are **optional** unless stated otherwise in this document.

---

## 2. Customer Fields

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| Name | No | Text | Display name; may be empty |
| Customer Number | No | Text | Business reference number; searchable |
| Profile Photo | No | Image file | JPEG/PNG/WebP; max 5 MB |

### Profile Photo Storage

- Saved to: `%APPDATA%/CustomerAccounting/data/images/customers/{customer_id}.{ext}`
- Database stores relative filename only: `customers/123.jpg`
- On customer delete: delete image file in same operation
- Included in system backup

### Validation

| Field | Rule |
|-------|------|
| Name | Max 200 characters if provided |
| Customer Number | Max 50 characters if provided |
| Photo | MIME validation; max 5 MB; reject executables |

---

## 3. Create Customer

### Flow

1. User clicks **Add Customer** on main page
2. Modal/form opens with Name, Customer Number, Photo upload
3. User submits (all fields may be blank)
4. System creates customer record
5. Customer appears in main list immediately

### Empty Customer

A customer with no name and no number is valid. Display fallback:

- List/detail: `(No Name)` localized key `customer.noName`
- Avatar: initials placeholder or generic icon

---

## 4. Main Customer List

Displayed immediately after login at route `/`.

### Columns

| # | Column | Source |
|---|--------|--------|
| 1 | Photo | Thumbnail or placeholder |
| 2 | Name | `customers.name` or fallback |
| 3 | Customer Number | `customers.customer_number` |
| 4 | AFN Balance | Computed from transactions |
| 5 | USD Balance | Computed from transactions |
| 6 | EUR Balance | Computed from transactions |
| 7 | Cash In Count | COUNT where type = CASH_IN |
| 8 | Cash Out Count | COUNT where type = CASH_OUT |
| 9 | Actions | Edit, Delete |

### Balance Display

- Format per locale and currency
- Show `0.00` (or locale equivalent) when no transactions for that currency
- Balance color: neutral (not green/red — colors reserved for transaction types)

### Global Totals (Top of Page)

Above the table, show sums across **all customers**:

```
Total AFN = Σ (each customer's AFN balance)
Total USD = Σ (each customer's USD balance)
Total EUR = Σ (each customer's EUR balance)
```

Each total is independent. Never add AFN + USD + EUR.

If no customers or no transactions for a currency → show `0`.

### Edit from List

- **Edit** action opens edit form (modal or inline)
- Same fields as create
- Save updates list row without full page reload

### Delete from List

1. User clicks Delete
2. Confirmation dialog (localized):
   - Warns that customer AND all transactions will be permanently deleted
3. On confirm: atomic delete (customer + transactions + photo file)
4. Row removed from list; global totals recalculated

---

## 5. Customer Detail View

Route: `/customers/:id`

### Information Section

- Profile photo (large)
- Name
- Customer Number
- Created date (optional display)

### Per-Currency Summary

For **each active currency** (AFN, USD, EUR):

| Metric | Description |
|--------|-------------|
| Total Cash In | Sum of CASH_IN amounts for this currency |
| Total Cash Out | Sum of CASH_OUT amounts for this currency |
| Balance | Cash In − Cash Out |
| Cash In Count | Number of CASH_IN transactions |
| Cash Out Count | Number of CASH_OUT transactions |

Display Cash In values with green accent; Cash Out with red accent.

If currency has no transactions:
- Totals: 0
- Counts: 0
- Balance: 0

### Transaction History

See `transactions.md` — embedded table on this page.

### Actions

- Edit Customer
- Add Transaction
- Back to list

---

## 6. Edit Customer

- Same form as create, pre-filled
- Photo: show current; allow replace or remove
- Save updates `updated_at`
- Does not affect transaction history

---

## 7. Delete Customer

| Step | Behavior |
|------|----------|
| Trigger | Delete button on list or detail |
| Confirm | Required explicit confirmation |
| Cascade | Delete all transactions for customer |
| Files | Delete profile photo |
| Atomic | Single database transaction |

---

## 8. Search and Filter (Optional v1.0)

If implemented:
- Search by name or customer number
- Debounced text input in action bar

Not required for v1.0 MVP but architecture should not prevent it.

---

## 9. IPC API

### `customers:list`

**Output:**
```typescript
{
  customers: Array<{
    id: number;
    name: string | null;
    customerNumber: string | null;
    photoUrl: string | null;  // app:// or file protocol path
    balances: { AFN: string; USD: string; EUR: string };
    cashInCount: number;
    cashOutCount: number;
  }>;
  totals: { AFN: string; USD: string; EUR: string };
}
```

### `customers:get`

**Input:** `{ id: number, transactionPage?: number }`

**Output:** Customer info + per-currency summary + paginated transactions

### `customers:create`

**Input:** `{ name?, customerNumber?, photoBase64? }`

### `customers:update`

**Input:** `{ id, name?, customerNumber?, photoBase64?, removePhoto? }`

### `customers:delete`

**Input:** `{ id: number }`

**Requires:** Valid session; UI must confirm before calling

---

## 10. Edge Cases

| Case | Behavior |
|------|----------|
| Duplicate customer numbers | Allowed (not unique constraint) — warn on import only |
| Customer with no transactions | All balances 0, counts 0 |
| Very long name | Truncate display in table with tooltip; full name in detail |
| Photo upload failure | Show error; do not create partial record unless user opts to skip photo |

---

## 11. Localization Keys (Examples)

```
customer.add
customer.edit
customer.delete
customer.deleteConfirm
customer.noName
customer.name
customer.number
customer.photo
customer.detail
customer.balances
```

All UI text via i18n — see `localization.md`.
