# UI/UX Design Specification

Visual design, layout patterns, and interaction guidelines.

---

## 1. Design Principles

| Principle | Application |
|-----------|-------------|
| Professional | Business-appropriate; no playful or toy-like elements |
| Modern | Clean typography, adequate whitespace, subtle shadows |
| Simple | Non-technical users can learn core flows in minutes |
| Fast | Optimistic UI where safe; loading states for heavy operations |
| Safe | Confirm destructive actions; show clear error messages |
| Accessible | Sufficient contrast, keyboard navigation for forms |

---

## 2. Visual Identity

### Color Palette

| Token | Usage | Example |
|-------|-------|---------|
| `--color-cash-in` | Cash In amounts, badges, icons | `#16A34A` (green-600) |
| `--color-cash-out` | Cash Out amounts, badges, icons | `#DC2626` (red-600) |
| `--color-primary` | Primary buttons, links | `#2563EB` (blue-600) |
| `--color-danger` | Delete confirmations | `#DC2626` |
| `--color-background` | App background | `#F8FAFC` |
| `--color-surface` | Cards, panels | `#FFFFFF` |
| `--color-text` | Primary text | `#0F172A` |
| `--color-text-muted` | Secondary text | `#64748B` |
| `--color-border` | Dividers, table borders | `#E2E8F0` |

**Non-negotiable:** Cash In = green, Cash Out = red, everywhere (lists, detail, reports color cues where applicable).

### Typography

- **English:** Inter or system-ui sans-serif
- **Dari/Pashto:** Vazirmatn or Noto Naskh Arabic (must support Arabic script shaping)
- Base size: 14px; headings scale 16/20/24px

### Spacing

- 4px grid system
- Page padding: 24px
- Card padding: 16–24px
- Table row height: min 44px for touch-friendly targets

---

## 3. Application Shell

```
┌────────────────────────────────────────────────────────────┐
│  [Logo] Customer Accounting          [Lang ▼] [Settings] [Logout] │
├────────────────────────────────────────────────────────────┤
│  Total AFN: 125,000  │  Total USD: 3,500  │  Total EUR: 0 │
├────────────────────────────────────────────────────────────┤
│  [+ Add Customer]  [Import]  [Reports ▼]  [Backup]         │
├────────────────────────────────────────────────────────────┤
│                    MAIN CONTENT AREA                        │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

- **No sidebar dashboard** — main content IS the customer list
- Top bar: app title, language selector, settings, logout
- Summary bar: three currency totals (always visible on main page)
- Action bar: primary actions above customer table

---

## 4. Screen Inventory

| Screen | Route/ID | Access |
|--------|----------|--------|
| Login | `/login` | Unauthenticated |
| Import Existing System | `/restore` | Unauthenticated |
| Customer List (Main) | `/` | Authenticated |
| Customer Detail | `/customers/:id` | Authenticated |
| Add/Edit Customer | modal or `/customers/new`, `/customers/:id/edit` | Authenticated |
| Add Transaction | modal on customer detail | Authenticated |
| Reports | `/reports` | Authenticated |
| Import Preview | `/import/preview` | Authenticated |
| Settings | `/settings` | Authenticated |
| Backup Progress | modal | Authenticated |

---

## 5. Login Screen

- Centered card layout
- Fields: Username, Password
- **No autofill:** `autocomplete="off"`, `autoComplete="new-password"` on password field, no saved credential hints
- Button: "Login"
- Link below form: **"Import Existing System"** → restore flow
- Error message area (localized): invalid credentials
- No "remember me" checkbox (single admin desktop app)

---

## 6. Customer List (Main Page)

### Summary Bar

Three stat cards or inline values:

```
Total AFN    1,250,000.00
Total USD       12,500.00
Total EUR            0.00
```

- Show `0` or `0.00` when no value
- Format numbers per locale (see `localization.md`)

### Table Columns

| Column | Alignment | Notes |
|--------|-----------|-------|
| Photo | center | Thumbnail 32×32 or initials avatar |
| Name | start | — |
| Customer Number | start | — |
| AFN Balance | end | Color neutral; green/red only for transaction type rows |
| USD Balance | end | — |
| EUR Balance | end | — |
| Cash In (#) | end | Count only |
| Cash Out (#) | end | Count only |
| Actions | end | Edit, Delete icons |

- Sortable by name, customer number (optional v1.0)
- Empty state: illustration + "No customers yet" + Add Customer CTA
- Edit opens modal or slide-over panel without leaving list

### Delete Customer

Confirmation dialog:
- Title: localized "Delete Customer?"
- Body: customer name + warning that transactions will be deleted
- Buttons: Cancel (secondary), Delete (danger red)

---

## 7. Customer Detail

### Header Section

- Profile photo (large)
- Name, customer number
- Edit button

### Balance Cards (per currency)

For each active currency (AFN, USD, EUR):

```
┌─────────────────────────┐
│ AFN                      │
│ Cash In:    500,000  (12)│  ← green for Cash In label/value
│ Cash Out:   200,000   (5)│  ← red for Cash Out label/value
│ Balance:    300,000      │
└─────────────────────────┘
```

### Transaction History

| Date | Type | Currency | Amount | Note | Actions |
|------|------|----------|--------|------|---------|
| ... | Cash In (green badge) | AFN | 5,000 | ... | Delete |

- Type column uses colored badge: green "Cash In", red "Cash Out"
- Note column: truncate in table with tooltip/expand for long notes
- Pagination controls at bottom when enabled and > page size
- **[+ Add Transaction]** button prominent

---

## 8. Transaction Form (Modal)

| Field | Required | UI |
|-------|----------|-----|
| Type | Yes | Radio or toggle: Cash In / Cash Out |
| Amount | Yes | Numeric input, decimal allowed |
| Currency | Yes | Dropdown: AFN, USD, EUR |
| Date | Yes (default today) | Date picker |
| Note | No | Multiline textarea, resizable, no max length indicator |

- Cash In selection highlights green border/accent
- Cash Out selection highlights red border/accent
- Validation errors inline below fields (localized)

---

## 9. Settings Screen

Sections:

1. **General** — Language (EN / Dari / Pashto)
2. **Transactions** — Pagination enabled toggle, page size (if enabled)
3. **Currencies** — List active currencies; add new (future extensibility hook)
4. **Account** — Placeholder for password change (future); show username read-only
5. **About** — App version, data directory path (read-only, copy button)

---

## 10. Reports Screen

- Report type selector (dropdown)
- Customer selector (for individual reports)
- Date range picker (for date-range reports)
- Format: PDF / Excel radio
- Language: uses current UI language
- **[Generate Report]** → progress indicator → save dialog

---

## 11. Import Flow

1. Select Excel file
2. Parsing progress
3. Preview screen:
   - Summary: X valid rows, Y errors
   - Tabbed or scrollable error list with row numbers
   - Preview table of valid rows (first N)
   - Buttons: **Cancel**, **Import Valid Rows** (disabled if zero valid)
4. Success toast + navigate to customer list

---

## 12. Backup / Restore UI

### Backup (in app)

- Button triggers save dialog for destination
- Progress modal
- Success: show path + file size

### Restore (pre-login)

- Dedicated screen from login
- Select `.cab` file
- Validation results panel:
  - Backup date
  - App version
  - Customer count
  - Transaction count
- Checkbox: "I understand this will replace current data"
- **[Restore]** disabled until checkbox checked
- If existing data detected: extra warning + safety backup notice

---

## 13. RTL Layout Rules

When language is Dari or Pashto:

- Set `dir="rtl"` on `<html>` or root layout
- Mirror navigation flow; use CSS logical properties (`margin-inline-start`, `text-align: start`)
- Icons that imply direction (chevrons) must flip
- Numbers may remain LTR within RTL context (use `dir="ltr"` on numeric cells if needed)
- Tables: column order may mirror for RTL

See `localization.md` for full RTL specification.

---

## 14. Responsive Behavior

Desktop window minimum size: **1024 × 600**

- Tables horizontally scroll on narrow widths
- Modals max-width 560px
- Summary bar stacks vertically below 768px internal width

---

## 15. Loading and Error States

| State | Pattern |
|-------|---------|
| Loading list | Skeleton rows or spinner overlay |
| Empty | Illustration + message + CTA |
| Error | Red banner with retry button |
| Success | Green toast, auto-dismiss 3s |

All messages localized.

---

## 16. Keyboard Shortcuts (Optional v1.0)

| Shortcut | Action |
|----------|--------|
| Ctrl+N | Add customer (when on main page) |
| Escape | Close modal |
| Enter | Submit form (when focused) |

---

## 17. Components to Build

Reusable components:

- `AppShell`, `TopBar`, `SummaryBar`
- `CustomerTable`, `CustomerForm`, `CustomerAvatar`
- `TransactionTable`, `TransactionForm`, `TypeBadge`
- `ConfirmDialog`, `Toast`, `LoadingOverlay`
- `CurrencyAmount` (formatted display)
- `LanguageSelector`
- `ReportForm`, `ImportPreview`
- `RestoreWizard`

All text via i18n keys.
