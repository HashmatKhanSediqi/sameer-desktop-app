# Reports

PDF and Excel report generation with RTL support for Dari and Pashto.

---

## 1. Overview

| Attribute | Value |
|-----------|-------|
| Formats | PDF, Excel (XLSX) |
| Languages | English (LTR), Dari (RTL), Pashto (RTL) |
| Generation | Main process (heavy lifting) + renderer (UI/ preview) |

---

## 2. Report Types

| Type | ID | Description |
|------|----|-------------|
| Individual Customer | `customer` | Single customer summary + transactions |
| All Customers | `all_customers` | Every customer with balances |
| Date Range | `date_range` | Transactions within date range |
| Transaction Report | `transactions` | Detailed transaction listing |
| Currency Summary | `currency_summary` | Aggregated totals per currency |

All report types available in both PDF and XLSX unless noted.

---

## 3. Common Report Content

### Header (All Reports)

- Application name (localized)
- Report title (localized)
- Generation date/time
- Date range (if applicable)
- Language indicator

### Customer Fields (Where Applicable)

- Customer name
- Customer number
- Cash In count
- Cash Out count

### Transaction Fields (Where Applicable)

- Date
- Type (Cash In / Cash Out)
- Currency
- Amount
- Note

### Currency Summary (All Relevant Reports)

For **each currency separately**:

| Metric | Value |
|--------|-------|
| Cash In Total | Sum or 0 |
| Cash Out Total | Sum or 0 |
| Balance (Total) | Cash In − Cash Out or 0 |

If no transactions exist for a currency in scope → display **0** for all three.

### Aggregate Metrics

- Total customer count
- Total transaction count
- Overall balances per currency (not combined)

---

## 4. Report Type Specifications

### 4.1 Individual Customer Report

**Input:** customerId, optional date range, format, language

**Sections:**
1. Customer information
2. Per-currency summary (AFN, USD, EUR)
3. Transaction list (all or filtered by date)

### 4.2 All Customers Report

**Sections:**
1. Summary totals per currency (global)
2. Table: Name, Number, AFN balance, USD balance, EUR balance, Cash In count, Cash Out count
3. Footer: customer count

### 4.3 Date Range Report

**Input:** startDate, endDate

**Sections:**
1. Transactions in range (all customers or selected)
2. Per-currency totals for filtered transactions only
3. Customer count affected

### 4.4 Transaction Report

Detailed flat list of transactions with all fields.

### 4.5 Currency Summary Report

Per currency:
- Total Cash In (all customers)
- Total Cash Out (all customers)
- Net Balance
- Transaction count
- Customer count with activity in that currency

---

## 5. Table Layout Rules

### No Overflow

- Fixed column widths in PDF
- Text wrapping within cells
- Long notes wrap to multiple lines within note column — **never spill into amount or date columns**
- Use `overflow: hidden` + wrap, or dynamic row height

### Excel (XLSX)

- Set explicit column widths
- Wrap text enabled on note column
- Header row bold/frozen
- Number format per currency column

### PDF

- Landscape orientation for wide reports (all customers, transactions)
- Portrait for single customer summary (optional)
- Page breaks between major sections if needed
- Repeat header row on each page

---

## 6. RTL / LTR PDF Requirements

### Critical Requirement

Dari and Pashto are **RTL languages** using Arabic script. **Do NOT assume Unicode font alone is sufficient.**

Required pipeline for RTL PDF:

1. **Font embedding** — Noto Naskh Arabic, Vazirmatn, or equivalent with full Arabic/Persian/Pashto glyph coverage
2. **Text shaping** — Arabic-script contextual letter forms (initial/medial/final/isolated)
3. **Bidirectional (bidi) algorithm** — Correct RTL ordering for mixed RTL text and LTR numbers
4. **Document direction** — Set RTL page/column direction for Dari/Pashto reports

### Recommended Implementation

**Option A (Preferred):** Main process PDF generation with:
- `@react-pdf/renderer` in Node context OR
- `pdfkit` + `arabic-persian-reshaper` + `bidi-js`
- Embedded TTF/OTF fonts in PDF

**Option B:** HTML → PDF via headless Chromium with proper `dir="rtl"` and web fonts (ensure shaping via browser engine)

### English Reports

- LTR direction
- Standard Western number formatting
- Latin font (Inter, Helvetica)

### Mixed Content

- Numbers and dates may render LTR within RTL paragraphs
- Use Unicode bidi isolates (U+2066, U+2069) where needed

### Validation

Before release, manually verify PDF output contains:
- [ ] Connected Arabic-script letters (not isolated/disconnected)
- [ ] Correct RTL reading order
- [ ] Numbers readable and aligned
- [ ] Table headers aligned correctly in RTL

---

## 7. Excel RTL

- Set worksheet `rightToLeft` property for Dari/Pashto
- Column order may mirror RTL layout
- Cell values remain proper Unicode strings
- Test opening in Microsoft Excel on Windows

---

## 8. Color in Reports

| Element | Color |
|---------|-------|
| Cash In label/amount | Green (#16A34A) |
| Cash Out label/amount | Red (#DC2626) |
| Headers | Dark gray/black |
| Body text | Black |

PDF: use color for type column; keep body readable in B&W printing (optional: grayscale fallback).

---

## 9. Report Generation Flow

```
User selects report options in UI
        │
        ▼
IPC reports:generate({ type, format, language, params })
        │
        ▼
Main: ReportsService
  1. Query database
  2. Build report model
  3. Render PDF or XLSX
  4. Write to temp file
        │
        ▼
Return file path → Save dialog → user saves
```

Progress events for long reports via IPC event channel.

---

## 10. IPC API

### `reports:generate`

**Input:**
```typescript
{
  sessionId: string;
  type: 'customer' | 'all_customers' | 'date_range' | 'transactions' | 'currency_summary';
  format: 'pdf' | 'xlsx';
  language: 'en' | 'fa-AF' | 'ps';
  customerId?: number;
  startDate?: string;
  endDate?: string;
}
```

**Output:**
```typescript
{
  success: true;
  filePath: string;  // temp path for save dialog
  fileName: string;  // suggested filename
}
```

---

## 11. Filename Convention

```
CustomerAccounting_{ReportType}_{CustomerNameOrAll}_{YYYY-MM-DD}.{pdf|xlsx}
```

Sanitize customer name for filesystem.

---

## 12. Performance

| Report Size | Target |
|-------------|--------|
| < 100 rows | < 2 seconds |
| < 1000 rows | < 10 seconds |
| > 1000 rows | Show progress bar; stream if possible |

For very large exports, consider chunked Excel writing.

---

## 13. Error Handling

| Error | User Message |
|-------|--------------|
| No data in range | Localized "No data for selected criteria" |
| Customer not found | Localized error |
| Write failure | Localized "Could not save report" |
| Font missing | Log error; fail with clear message (do not produce broken PDF)

---

## 14. i18n Keys (Examples)

```
report.title.customer
report.title.allCustomers
report.title.dateRange
report.cashIn
report.cashOut
report.balance
report.generatedAt
report.noData
report.column.date
report.column.type
report.column.currency
report.column.amount
report.column.note
```

All column headers and titles must use i18n — never hardcoded.

---

## 15. Testing Requirements

See `testing.md` — must verify:
- PDF structure (no column overflow)
- Excel column widths
- Dari RTL readability
- Pashto RTL readability
- English LTR correctness
- Zero values for empty currencies
