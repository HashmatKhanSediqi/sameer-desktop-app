# Localization

Multi-language support for Dari, Pashto, and English with RTL/LTR layout.

---

## 1. Overview

| Language | Code | Direction | Script |
|----------|------|-----------|--------|
| English | `en` | LTR | Latin |
| Dari | `fa-AF` | RTL | Arabic (Persian/Dari) |
| Pashto | `ps` | RTL | Arabic (Pashto) |

**Entire UI must be localized** — no hardcoded user-visible strings in components.

---

## 2. Localization System

### Technology

- **i18next** + **react-i18next**
- Translation files: JSON per locale
- Namespace organization by feature

### File Structure

```
src/renderer/i18n/
├── index.ts              # i18next init
├── locales/
│   ├── en/
│   │   ├── common.json
│   │   ├── auth.json
│   │   ├── customers.json
│   │   ├── transactions.json
│   │   ├── reports.json
│   │   ├── settings.json
│   │   ├── import.json
│   │   ├── backup.json
│   │   └── errors.json
│   ├── fa-AF/
│   │   └── (same structure)
│   └── ps/
│       └── (same structure)
```

### Usage Pattern

```tsx
// CORRECT
const { t } = useTranslation('customers');
<Button>{t('add')}</Button>

// WRONG — never do this
<Button>Add Customer</Button>
```

### Interpolation

```json
{
  "deleteConfirm": "Delete customer {{name}}? This will remove {{count}} transactions."
}
```

---

## 3. Language Selection

- Settings → Language dropdown
- Persist in `settings.language` database key
- Apply immediately without restart (preferred) or on next launch
- Default: `en`

### Login Screen

Language selector available before login (stored on change for after login).

---

## 4. RTL / LTR Layout

### Root Direction

```tsx
// App root
<html dir={isRtl ? 'rtl' : 'ltr'} lang={currentLocale}>
```

| Locale | dir |
|--------|-----|
| en | ltr |
| fa-AF | rtl |
| ps | rtl |

### CSS Guidelines

Use **logical properties** instead of physical:

| Avoid | Use |
|-------|-----|
| `margin-left` | `margin-inline-start` |
| `padding-right` | `padding-inline-end` |
| `text-align: left` | `text-align: start` |
| `border-left` | `border-inline-start` |

### Component Mirroring

| Element | RTL Behavior |
|---------|--------------|
| Navigation | Flow right-to-left |
| Back arrows | Flip horizontally |
| Dialog buttons | Primary on start side (right in RTL) |
| Form labels | Align to start |
| Table columns | Order may mirror; numbers stay end-aligned |
| Scrollbars | OS default |

### Numbers and Dates

- Monetary amounts: often displayed LTR even in RTL UI
- Wrap amount cells: `<span dir="ltr">{formattedAmount}</span>`
- Dates: locale-formatted via `Intl.DateTimeFormat`

---

## 5. Fonts

| Language | Font Family |
|----------|-------------|
| English | Inter, system-ui |
| Dari | Vazirmatn, Noto Naskh Arabic |
| Pashto | Noto Naskh Arabic, Vazirmatn |

Fonts must be bundled in application (not CDN — offline requirement).

```
assets/fonts/
├── Inter-Regular.woff2
├── Vazirmatn-Regular.woff2
└── NotoNaskhArabic-Regular.woff2
```

CSS:

```css
[lang="fa-AF"], [lang="ps"] {
  font-family: 'Vazirmatn', 'Noto Naskh Arabic', sans-serif;
}
```

---

## 6. PDF Localization

See `reports.md` for full RTL PDF pipeline.

Summary:
- Dari/Pashto PDFs: RTL direction, embedded Arabic-script fonts, text shaping
- English PDFs: LTR, Latin fonts
- Report titles and column headers from i18n files

Main process report generator loads same translation JSON or parallel locale files.

---

## 7. Excel Localization

- Column headers translated to current language
- Worksheet `rightToLeft = true` for fa-AF and ps
- Cell values: Unicode preserved (Dari/Pashto customer names)

---

## 8. Validation and Error Messages

All validation errors localized:

```typescript
// Main process returns error code
{ code: 'INVALID_AMOUNT' }

// Renderer maps to i18n
t('errors:INVALID_AMOUNT')
```

Maintain error code → key mapping in shared constants.

---

## 9. Pluralization

Use i18next plural forms:

```json
{
  "transactionCount": "{{count}} transaction",
  "transactionCount_plural": "{{count}} transactions"
}
```

RTL languages may have different plural rules — verify i18next plural resolver.

---

## 10. Translation Key Conventions

```
{namespace}.{section}.{element}

Examples:
customers.list.title
customers.form.nameLabel
transactions.type.cashIn
reports.column.amount
auth.error.invalidCredentials
common.confirm
common.cancel
common.delete
```

---

## 11. Coverage Checklist

Every UI surface must be localized:

- [ ] Login and restore screens
- [ ] Main customer list and totals
- [ ] Customer forms and detail
- [ ] Transaction forms and list
- [ ] Settings all sections
- [ ] Reports UI and generated output
- [ ] Import preview and errors
- [ ] Backup/restore dialogs
- [ ] Update dialogs
- [ ] Confirmation dialogs
- [ ] Toast notifications
- [ ] Empty states
- [ ] Loading states
- [ ] Installer (future — separate WiX/NSIS i18n if needed)

---

## 12. Date and Number Formatting

```typescript
const formatter = new Intl.NumberFormat(locale, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat(locale, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
```

Locale mapping:
- `en` → `en-US` or `en-GB` (choose one, document in code)
- `fa-AF` → `fa-AF`
- `ps` → `ps-AF`

---

## 13. Testing

- [ ] Switch language in Settings updates all visible text
- [ ] RTL layout mirrors correctly for Dari
- [ ] RTL layout mirrors correctly for Pashto
- [ ] English remains LTR
- [ ] No hardcoded strings found by lint rule
- [ ] PDF Dari/Pashto readable (shaped, connected letters)
- [ ] Long Dari text wraps correctly in forms and tables

---

## 14. Adding Translations (Workflow)

1. Add English key first in `en/*.json`
2. Add equivalent keys in `fa-AF/*.json` and `ps/*.json`
3. Missing key fallback: English (dev warning in console)
4. CI/lint: fail build on missing keys (recommended)

---

## 15. Assumption: Translation Quality

Documentation assumes professional human translation for production. Development may use placeholder translations; structure must support full translation before release.
