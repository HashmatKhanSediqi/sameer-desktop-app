# UI/UX Design Specification

Visual design, layout patterns, and interaction guidelines for **FMT**.

Brand: green primary (`#1F7A4D` family), Cash In green / Cash Out red, FMT logo/icon.

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
| `--color-primary` | Primary buttons, links, login accent | `#1F7A4D` |
| `--color-primary-hover` | Primary button hover | `#258A58` |
| `--color-primary-pressed` | Primary button pressed | `#17653F` |
| `--color-cash-in` | Cash In amounts, badges, icons | `#16A34A` (green-600) |
| `--color-cash-out` | Cash Out amounts, badges, icons | `#DC2626` (red-600) |
| `--color-balance-positive` | Positive customer balances on the list | `#15803D` |
| `--color-balance-negative` | Negative customer balances on the list | `#B91C1C` |
| `--color-danger` | Delete confirmations | `#DC2626` |
| `--color-background` | App background | `#FFFFFF` |
| `--color-surface` | Cards, panels | `#FFFFFF` |
| `--color-text` | Primary text | `#0F172A` |
| `--color-text-muted` | Secondary text | `#64748B` |
| `--color-border` | Dividers, table borders | `#DCE6E0` |
| `--summary-tone-1-*` | First currency total card (AFN by default) | Soft sage |
| `--summary-tone-2-*` | Second currency total card (USD by default) | Soft blue-gray |
| `--summary-tone-3-*` | Third currency total card (EUR by default) | Soft sand |

**Non-negotiable:** Cash In = green, Cash Out = red, everywhere (lists, detail, reports color cues where applicable).

**Customer list balances:** positive = green, negative = red, zero = default text color. This is display-only and must not change calculations.

Summary card colors are CSS variables so an administrator color picker can later override `--summary-tone-N-*` without a schema change. Do not hardcode card colors in components.

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
│  [Company logo] Company name          [Lang ▼] [Settings] [Logout] │
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

- Centered elevated card on a quiet green-tinted background with subtle depth (soft orbs, not a busy illustration)
- Fields: Username, Password
- **No autofill:** `autocomplete="off"`, `autoComplete="new-password"` on password field, no saved credential hints
- Dimensional primary Login button with hover and pressed states
- Language selector in the logical top-end corner
- Link below form: **"Import Existing System"** → restore flow
- Error message area (localized): invalid credentials
- No "remember me" checkbox (single admin desktop app)

---

## 6. Customer List (Main Page)

### Summary Bar

Raised currency total cards (balance only — not a dashboard):

```
Total AFN    1,250,000.00
Total USD       12,500.00
Total EUR            0.00
```

- Show `0` or `0.00` when no value
- Format numbers per locale (see `localization.md`)
- Soft per-currency tones via `--summary-tone-N-*` tokens
- Do **not** show Cash In / Cash Out totals on the customer list

### Table Columns

| Column | Alignment | Notes |
|--------|-----------|-------|
| Photo | center | Thumbnail 32×32 or initials avatar |
| Name | start | — |
| Customer Number | start | — |
| AFN Balance | end | Green if positive, red if negative, default if zero |
| USD Balance | end | Same sign coloring |
| EUR Balance | end | Same sign coloring |
| Actions | end | View, Edit, Delete |

Cash In / Cash Out counts remain on Customer Detail, transactions, and reports — not on the customer list.

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

### Layout

Two-column content row that follows document direction:

- **English (LTR):** customer information card on the **left**; balances and history on the right
- **Dari / Pashto (RTL):** customer information card on the **right**; balances and history on the left
- Large desktop: information card occupies about **35–40%** of the content row; history keeps the remaining space
- Implemented with flexbox and CSS logical properties (no language-specific layouts)
- Below ~960px, the information card stacks above the remaining content
- Desktop two-column: the details page fills the viewport; header, profile, and currency cards stay put; **only Transaction History scrolls**
- Stacked (below ~960px): page scroll is allowed so the layout remains usable

### Header Section

- Back button at inline-start
- Single primary **Add Transaction** button, plus **Export PDF**, Edit, and Delete at inline-end
- Do not duplicate Add Transaction on the history card
- Export PDF uses the existing `reports:generate` customer PDF path (current language, RTL/LTR as already implemented)

### Customer information card

- Profile photo (large), name, customer number, created/updated timestamps
- Elevated card with start-edge accent; fields use existing customer data only

### Balance Cards (per currency)

For each active currency (AFN, USD, EUR):

```
┌─────────────────────────┐
│ Balance                  │
│ AFN ؋                    │
│           300,000        │  ← green if positive, red if negative
│ Cash In:  500,000  (12)  │  ← green
│ Cash Out: 200,000   (5)  │  ← red
└─────────────────────────┘
```

- Soft tones, subtle elevation, same `--summary-tone-*` tokens as the customer list
- Cash In / Cash Out remain on this page (not on the customer list)

### Transaction History

| Date | Type | Currency | Amount | Note | Actions |
|------|------|----------|--------|------|---------|
| ... | Cash In (green badge) | AFN | 5,000 | ... | Edit, Delete |

- Date column shows locale-formatted date **and** time
- Type column uses colored badge: green "Cash In", red "Cash Out"
- Note column: truncate in table with tooltip/expand for long notes
- Pagination controls at bottom when enabled and > page size
- Add Transaction remains a single page-header action (not duplicated on the history card)

---

## 8. Transaction Form (Modal)

Elevated dialog matching the app surface (white card, rounded corners, soft shadow). Header shows Add/Edit title plus customer name. If the form is taller than the viewport, only the modal body scrolls; footer actions stay visible.

| Field | Required | UI |
|-------|----------|-----|
| Type | Yes | Segmented Cash In / Cash Out; green vs red selected state plus border |
| Amount | Yes | Prominent LTR numeric input with currency affix |
| Currency | Yes | Dropdown of active codes (untranslated) |
| Date | Yes (default today) | Date picker |
| Note | No | Multiline textarea, resizable, no max length indicator |

- Primary submit: Add Transaction (create) or Save (edit)
- Cancel is secondary; Escape closes the modal
- Validation errors inline below fields (localized)

---

## 9. Settings Screen

Sections:

1. **General** — Language (EN / Dari / Pashto)
2. **Transactions** — Pagination enabled toggle, page size (if enabled)
3. **Currencies** — List active currencies; add / deactivate
4. **Account & Security** — Change password; security question/answer (hashed)
5. **Appearance** — Primary/accent colors and main-page card colors, with reset
6. **Company Profile** — Name, logo, phone, email, address, website, notes
7. **Currency Exchange** — Enable/disable the main-page calculator (default off)
8. **About** — App version, data directory path (read-only, copy button)

Theme colors persist in settings and apply through CSS variables (`--color-primary`, `--summary-tone-*`). The default green/white design remains until the administrator changes it.

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

Desktop window minimum size: **1024 × 600**. Layouts also adapt down toward tablet widths using flex/grid wrapping, CSS logical properties, and container queries.

- No page-level horizontal scrolling for normal chrome (header, forms, cards, dialogs)
- Header, page actions, and button groups wrap instead of overlapping
- Customer details: two columns down to ~960px (information card ~38% at inline-start); stacked below that, information card first
- Tables remain tables when the panel is wide; they switch to labeled stacked cards when the panel is narrower than ~840px
- Modals stay within the viewport (`max-width: 560px`, `max-height: 90dvh`)
- Summary cards use `auto-fit` grids and shrink with the container
- Forms collapse to a single column where a two-column row would overflow

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
