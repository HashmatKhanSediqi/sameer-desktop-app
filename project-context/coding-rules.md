# Coding Rules

Code style, project structure, and development conventions.

---

## 1. General Principles

1. **Read documentation before coding** — see `AI_INSTRUCTIONS.md`
2. **Minimal scope** — change only what the task requires
3. **Match existing patterns** — consistency over personal preference
4. **Type safety** — TypeScript strict mode enabled
5. **No guessing** — requirements come from `project-context/`

---

## 2. Language and Tools

| Tool | Version |
|------|---------|
| TypeScript | 5+ strict |
| React | 18+ functional components |
| Electron | Latest stable LTS-compatible |
| SQLite | via better-sqlite3 (main process) |
| Package manager | npm |

---

## 3. Project Structure

Follow `architecture.md` directory layout:

```
src/main/       → Main process (Node.js/Electron)
src/preload/    → contextBridge API
src/renderer/   → React UI
src/shared/     → Shared types and constants
migrations/     → SQL migration files
assets/         → Fonts, icons, static files
```

### Module Boundaries

| Layer | Allowed Dependencies |
|-------|---------------------|
| renderer | React, i18n, shared types, preload API |
| preload | Electron, shared types |
| main | Electron, better-sqlite3, services, shared types |
| shared | No Electron, no React — pure TypeScript |

**Renderer must NEVER import better-sqlite3 or access filesystem directly.**

---

## 4. Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Files (components) | PascalCase.tsx | `CustomerTable.tsx` |
| Files (services) | camelCase.ts | `customerService.ts` |
| Files (types) | camelCase.types.ts | `customer.types.ts` |
| React components | PascalCase | `CustomerTable` |
| Functions | camelCase | `getCustomerById` |
| Constants | UPPER_SNAKE_CASE | `MAX_PHOTO_SIZE` |
| IPC channels | namespace:action | `customers:list` |
| i18n keys | dot.notation | `customers.form.nameLabel` |
| Database tables | snake_case | `admin_users` |
| SQL columns | snake_case | `customer_number` |
| CSS classes | kebab-case (Tailwind) | `cash-in-badge` |

---

## 5. TypeScript Rules

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true
  }
}
```

- Explicit return types on exported functions
- No `any` — use `unknown` and narrow
- Shared types in `src/shared/types/`
- IPC request/response types defined centrally

---

## 6. React Conventions

- Functional components only
- Hooks for state and effects
- No class components
- Colocate component-specific hooks
- Extract reusable logic to custom hooks
- Props interfaces named `{ComponentName}Props`

```tsx
interface CustomerTableProps {
  customers: CustomerListItem[];
  onEdit: (id: number) => void;
}

export function CustomerTable({ customers, onEdit }: CustomerTableProps) {
  const { t } = useTranslation('customers');
  // ...
}
```

---

## 7. IPC Conventions

### Handler Registration

```typescript
// src/main/ipc/customers.handlers.ts
export function registerCustomerHandlers(ipcMain: IpcMain, deps: Dependencies) {
  ipcMain.handle('customers:list', async (event, req: CustomersListRequest) => {
    deps.authService.requireSession(req.sessionId);
    return deps.customerService.list();
  });
}
```

### Preload Exposure

```typescript
contextBridge.exposeInMainWorld('api', {
  customers: {
    list: (sessionId: string) => ipcRenderer.invoke('customers:list', { sessionId }),
  },
});
```

### Rules

- Every protected handler validates session first
- Validate input shape before processing
- Return typed responses — never throw uncaught errors to renderer
- Map errors to error codes, not stack traces

---

## 8. Database Conventions

- All SQL in dedicated repository files: `src/main/database/repositories/`
- Prepared statements only
- One repository per entity (CustomerRepository, TransactionRepository)
- Migrations numbered: `001_initial.sql`, `002_...sql`
- Never modify applied migrations — create new ones

---

## 9. Service Layer

Business logic in `src/main/services/`:

```
CustomerService → uses CustomerRepository, TransactionRepository
BackupService → uses FileService, DatabaseService
ReportsService → uses repositories + PDF/Excel generators
```

Services do not import React or Electron renderer APIs.

---

## 10. Localization Rules

```tsx
// ALWAYS
const { t } = useTranslation('namespace');
<span>{t('key')}</span>

// NEVER
<span>Add Customer</span>
```

Exception: proper nouns, currency codes (AFN, USD, EUR), and numeric values.

---

## 11. Styling

- Tailwind CSS utility classes
- CSS variables for theme tokens (colors, especially cash-in/cash-out)
- Logical properties for RTL: `ms-`, `me-`, `ps-`, `pe-`, `text-start`
- No inline styles except dynamic values

```css
:root {
  --color-cash-in: #16A34A;
  --color-cash-out: #DC2626;
}
```

---

## 12. Error Handling

```typescript
// Service returns Result type
type Result<T> = { ok: true; data: T } | { ok: false; errorCode: string };

// Not throwing for expected errors
async function createCustomer(input: CreateCustomerInput): Promise<Result<Customer>> {
  if (!isValid(input)) {
    return { ok: false, errorCode: 'VALIDATION_ERROR' };
  }
  // ...
}
```

Unexpected errors: log to file, return generic error code to UI.

---

## 13. Monetary Calculations

- Use `decimal.js` or `big.js` in main process
- Store as string in database
- Format for display in renderer with `Intl.NumberFormat`
- Never use JavaScript `number` for money arithmetic

---

## 14. File Organization per Feature

```
src/main/services/customer/
├── customerService.ts
├── customerRepository.ts
└── customer.types.ts

src/renderer/pages/customers/
├── CustomerListPage.tsx
├── CustomerDetailPage.tsx
└── components/
    ├── CustomerTable.tsx
    └── CustomerForm.tsx
```

---

## 15. Comments

- Comment non-obvious business logic only
- No commented-out code in commits
- JSDoc on public service methods

---

## 16. Git Conventions

- Branch naming: `feature/customer-list`, `fix/import-validation`
- Commit messages: imperative mood, concise
- Do not commit: `node_modules`, `.env`, `dist/`, secrets, user data

---

## 17. Dependencies

- Add dependencies deliberately — justify in PR/commit
- Prefer well-maintained packages
- Native modules (better-sqlite3) must be rebuilt for Electron
- No cloud SDKs for core functionality

---

## 18. Forbidden Patterns

| Pattern | Reason |
|---------|--------|
| MongoDB | Explicitly forbidden |
| Hardcoded UI strings | Violates localization |
| SQL string concatenation | SQL injection risk |
| `nodeIntegration: true` | Security risk |
| Plaintext passwords | Security violation |
| Mixed currency math | Business logic error |
| Audit log module | Removed from scope |
| `dangerouslySetInnerHTML` with user data | XSS risk |

---

## 19. Code Review Checklist

Before marking complete:

- [ ] Read relevant project-context docs
- [ ] TypeScript compiles without errors
- [ ] No hardcoded strings (i18n)
- [ ] Session validated on protected IPC
- [ ] Parameterized SQL only
- [ ] Destructive actions have confirmation UI
- [ ] Cash In green, Cash Out red
- [ ] Tests updated per testing.md
- [ ] changelog.md updated if feature complete

---

## 20. Environment

Development requires Node.js and npm on **developer machine only** — never on end-user machine.

```bash
npm install
npm run dev      # Development
npm run build    # Production build
npm run build:win # Windows installer
```

End user never runs these commands.
