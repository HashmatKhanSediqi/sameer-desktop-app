# Import and Export

Excel import/export specification with validation, preview, and atomic commit for **FMT**.

Template download filename: **`FMT_Import_Template.xlsx`**.

---

## 1. Overview

| Capability | Format | Direction |
|------------|--------|-----------|
| Bulk import (customers + transactions) | XLSX | External → App |
| Report export | PDF, XLSX | App → External |
| Data export (optional v1.1) | XLSX | App → External |

This document defines the **Excel import format** and import pipeline. Report export is covered in `reports.md`.

---

## 2. Import Principles

1. **Validate before commit** — parse entire file, collect all errors
2. **Preview before commit** — show valid rows and errors; user confirms
3. **Never silent failure** — every invalid row reported with row number and reason
4. **Never silent overwrite** — duplicate handling explicit (skip or error)
5. **Atomic commit** — all valid rows in one SQLite transaction; rollback on any failure
6. **Never partially destroy existing data** — import only adds/updates; no mass delete
7. **Cancel anytime** before commit with no changes

---

## 3. Excel Import Format

### File Requirements

| Attribute | Value |
|-----------|-------|
| Format | `.xlsx` (Excel 2007+) |
| Sheets | One or two sheets (see below) |
| Encoding | UTF-8 cell values |
| Max file size | 50 MB (configurable) |

### Sheet 1: `Customers` (Optional)

If present, import customers before transactions.

| Column | Header (exact) | Required | Type | Notes |
|--------|----------------|----------|------|-------|
| A | `customer_number` | No | Text | Unique identifier for linking |
| B | `name` | No | Text | Customer name |
| C | `photo_path` | No | Text | Relative path to image file (optional external folder) |

**Row 1:** Header row (required if sheet exists)

**Row 2+:** Data rows

### Sheet 2: `Transactions` (Required for transaction import)

| Column | Header (exact) | Required | Type | Notes |
|--------|----------------|----------|------|-------|
| A | `customer_number` | Yes* | Text | Links to customer; *or `customer_name` |
| B | `customer_name` | Yes* | Text | Alternative link if no number |
| C | `type` | Yes | Text | `CASH_IN` or `CASH_OUT` (case-insensitive); aliases: `Cash In`, `Cash Out` |
| D | `currency` | Yes | Text | `AFN`, `USD`, or `EUR` (case-insensitive) |
| E | `amount` | Yes | Number/Text | Positive decimal |
| F | `date` | No | Date/Text | ISO `YYYY-MM-DD` or Excel date; default: import date |
| G | `note` | No | Text | Unlimited length |

*At least one of `customer_number` or `customer_name` required per row.

### Example: Transactions Sheet

```
customer_number | customer_name | type     | currency | amount   | date       | note
C-001           | Ahmad Khan    | CASH_IN  | AFN      | 50000    | 2025-01-15 | Initial deposit
C-001           | Ahmad Khan    | CASH_OUT | AFN      | 10000    | 2025-02-01 | Payment
                | Guest User    | CASH_IN  | USD      | 500.00   |            |
```

### Minimal Valid File

A file with only a `Transactions` sheet and valid headers is acceptable. Customers referenced by number/name are auto-created if not found (optional behavior — **default: auto-create customer with provided name/number**).

Document this behavior: **Auto-create missing customers during import** with only the fields provided in the transaction row.

---

## 4. Validation Rules

### Structure Validation

| Check | Error Code |
|-------|------------|
| File not .xlsx | `INVALID_FORMAT` |
| Missing Transactions sheet (when importing transactions) | `MISSING_SHEET` |
| Missing required headers | `MISSING_HEADER` |
| Unknown columns | Warning (ignore extra columns) |
| Empty file (no data rows) | `NO_DATA` |

### Row Validation

| Field | Rule | Error Code |
|-------|------|------------|
| type | Must be CASH_IN or CASH_OUT | `INVALID_TYPE` |
| currency | Must match active currency | `INVALID_CURRENCY` |
| amount | Required, > 0, valid decimal | `INVALID_AMOUNT` |
| customer_number/name | At least one present | `MISSING_CUSTOMER` |
| date | Valid date if provided | `INVALID_DATE` |

### Duplicate Detection

| Scenario | Default Behavior |
|----------|------------------|
| Same customer_number in Customers sheet twice | Error on second row: `DUPLICATE_CUSTOMER` |
| Exact duplicate transaction (same customer, date, type, currency, amount) | Warning: `POSSIBLE_DUPLICATE` — import by default with user acknowledgment in preview |
| customer_number matches existing DB customer | Link to existing; do not create duplicate |

Configurable in future: "Skip duplicates" vs "Import as new".

---

## 5. Import Pipeline

```
┌──────────────┐
│ Select File  │
└──────┬───────┘
       ▼
┌──────────────┐
│ Parse XLSX   │  (exceljs)
└──────┬───────┘
       ▼
┌──────────────┐
│ Validate All │  → errors[] + validRows[]
│ Rows         │
└──────┬───────┘
       ▼
┌──────────────┐
│ Preview UI   │  Show counts, errors, sample valid rows
└──────┬───────┘
       ▼
   User Choice
   ┌────┴────┐
   ▼         ▼
 Cancel    Commit
   │         │
   ▼         ▼
  Stop    BEGIN TRANSACTION
          Insert/update customers
          Insert transactions
          COMMIT (or ROLLBACK on error)
          Show success summary
```

---

## 6. Preview Screen Requirements

Display:

| Item | Description |
|------|-------------|
| Total rows parsed | Count |
| Valid rows | Count (green) |
| Invalid rows | Count (red) |
| Error list | Row number, column, error code, value snippet |
| Valid preview table | First 50 valid rows |
| Warnings | Duplicate warnings |

Buttons:
- **Cancel** — discard, no DB changes
- **Import N Valid Rows** — commit only valid rows; disabled if N=0

User must explicitly click Import to commit.

---

## 7. Commit Behavior

```sql
BEGIN IMMEDIATE TRANSACTION;

-- For each valid customer row: INSERT OR match existing
-- For each valid transaction row: INSERT

COMMIT;
```

On any error during commit → `ROLLBACK` → show error, no partial data.

**Never:**
- Delete existing customers or transactions during import
- Update existing transaction amounts without explicit mapping (v1.0: import adds new records only)

---

## 8. Post-Import Summary

Show dialog:
- Customers created: N
- Customers matched existing: N
- Transactions imported: N
- Rows skipped (errors): N

Navigate to customer list.

---

## 9. Export Format (Template Download)

Provide **Download Import Template** in Import UI:

- Pre-formatted XLSX with headers and example row
- Localized sheet instructions in second row (comment or instructions sheet)

Template filename: `FMT_Import_Template.xlsx`

---

## 10. IPC API

### `import:parse`

**Input:** `{ sessionId, filePath }`

**Output:**
```typescript
{
  success: boolean;
  validCustomers: ParsedCustomer[];
  validTransactions: ParsedTransaction[];
  errors: Array<{
    sheet: string;
    row: number;
    column?: string;
    code: string;
    message: string;  // localized
    value?: string;
  }>;
  warnings: Array<{ row: number; code: string; message: string }>;
  summary: {
    totalRows: number;
    validCount: number;
    errorCount: number;
  };
}
```

### `import:commit`

**Input:**
```typescript
{
  sessionId: string;
  validCustomers: ParsedCustomer[];
  validTransactions: ParsedTransaction[];
}
```

**Output:**
```typescript
{
  success: boolean;
  customersCreated: number;
  customersMatched: number;
  transactionsImported: number;
  error?: string;
}
```

---

## 11. Security

- Validate file is valid ZIP/XLSX structure before parsing
- Limit row count (e.g., 100,000 rows) to prevent DoS
- Sanitize string values before SQL insert (parameterized queries)
- Do not execute macros — XLSX parsing only, no VBA execution

See `security.md`.

---

## 12. Error Message Localization

All error codes map to i18n keys:

```
import.error.invalidFormat
import.error.missingHeader
import.error.invalidAmount
import.error.invalidCurrency
import.error.invalidType
import.error.duplicateCustomer
import.preview.title
import.preview.importButton
import.preview.cancelButton
import.success.title
```

---

## 13. Testing Checklist

- [ ] Valid file imports correctly
- [ ] Invalid currency row rejected with row number
- [ ] Invalid amount row rejected
- [ ] Missing header detected
- [ ] Preview shows before commit
- [ ] Cancel leaves DB unchanged
- [ ] Commit failure rolls back entirely
- [ ] Large note field imports fully
- [ ] UTF-8 Dari/Pashto text in notes preserved
