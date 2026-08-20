# Architecture - Professional Accounting Suite

## Overview

React + TypeScript + Vite frontend for a complete accounting system.
Multi-agent local development with Ollama Qwen3:8b.

## Tech Stack

- **Framework**: React 18
- **Language**: TypeScript (strict mode)
- **Build**: Vite
- **Routing**: React Router v6
- **Styling**: Tailwind CSS
- **State**: Zustand
- **Forms**: React Hook Form + Zod validation
- **Tables**: TanStack Table (React Table)
- **Charts**: Recharts
- **Icons**: Lucide Icons
- **Dates**: date-fns
- **Dev**: Ollama Qwen3:8b locally

## Folder Structure

accounting-suite/
├── src/
│ ├── app/
│ │ ├── App.tsx # Root component
│ │ ├── router.tsx # Route definitions
│ │ └── providers.tsx # Context providers
│ ├── components/
│ │ ├── ui/ # Reusable UI components
│ │ ├── layout/ # Layout components
│ │ ├── charts/ # Chart components
│ │ ├── tables/ # Table components
│ │ ├── forms/ # Form components
│ │ └── feedback/ # Loading, error, empty states
│ ├── features/
│ │ ├── auth/ # Authentication
│ │ ├── dashboard/ # Dashboard
│ │ ├── customers/ # Customer domain
│ │ ├── suppliers/ # Supplier domain
│ │ ├── sales/ # Sales (quotes, orders, invoices)
│ │ ├── purchases/ # Purchases (POs, bills)
│ │ ├── banking/ # Banking & reconciliation
│ │ ├── accounting/ # Accounting (ledger, journals)
│ │ ├── inventory/ # Inventory & stock
│ │ ├── tax/ # Tax & VAT
│ │ ├── expenses/ # Expenses
│ │ ├── assets/ # Fixed assets
│ │ ├── employees/ # Payroll
│ │ ├── reports/ # Financial reports
│ │ └── admin/ # Administration
│ ├── services/ # Business logic services
│ ├── repositories/ # Data access layer
│ ├── stores/ # Zustand stores
│ ├── types/ # Shared TypeScript types
│ ├── utils/ # Utility functions
│ ├── config/ # Configuration
│ ├── hooks/ # Custom React hooks
│ ├── mock-data/ # Mock data for development
│ └── styles/ # Global styles
├── docs/ # Documentation
├── tests/ # Integration tests
├── .claude/
│ └── agents/ # Agent prompts
├── .vscode/ # VS Code settings
└── package.json


## Feature Module Structure

Each feature (customers, suppliers, etc.) has:

features/[feature]/
├── components/ # UI components
│ ├── [Feature]List.tsx
│ ├── [Feature]Form.tsx
│ ├── [Feature]Card.tsx
│ └── [Feature]Table.tsx
├── pages/ # Route pages
│ ├── [Feature]ListPage.tsx
│ ├── [Feature]DetailPage.tsx
│ └── [Feature]CreatePage.tsx
├── services/ # Business logic
│ └── [feature]Service.ts
├── repositories/ # Data access
│ └── Mock[Feature]Repository.ts
├── types/ # TypeScript
│ └── [feature].types.ts
├── hooks/ # Custom hooks
│ └── use[Feature].ts
├── store/ # State management
│ └── [feature]Store.ts
├── utils/ # Helpers
│ └── [feature]Utils.ts
└── tests/ # Tests
└── [feature].test.ts


## Data Access Layer

Component
↓
Hook / State
↓
Service (business logic)
↓
Repository (data access)
↓
Mock Repository (temporary)
↓
REST / Backend (future)


**RULE**: Components NEVER import repositories directly.

## Repository Pattern

```typescript
// Defines the contract
export interface ICustomerRepository {
  getAll(): Promise<Customer[]>;
  getById(id: string): Promise<Customer>;
  create(customer: Customer): Promise<Customer>;
  update(id: string, customer: Customer): Promise<Customer>;
  delete(id: string): Promise<void>;
}

// Mock implementation for development
export class MockCustomerRepository implements ICustomerRepository {
  private customers: Customer[] = [...];
  
  async getAll(): Promise<Customer[]> {
    return this.customers;
  }
  // ... etc
}
```

## Service Layer

Services contain business logic:

```typescript
export class CustomerService {
  constructor(private repository: ICustomerRepository) {}
  
  async getCustomers() {
    return this.repository.getAll();
  }
  
  async createCustomer(data: CreateCustomerDTO) {
    // Validation, transformation, etc.
    return this.repository.create(data);
  }
}
```

## State Management

Use Zustand for global state:

```typescript
export const useCustomerStore = create<CustomerState>((set) => ({
  customers: [],
  selectedCustomerId: null,
  
  setCustomers: (customers) => set({ customers }),
  selectCustomer: (id) => set({ selectedCustomerId: id }),
}));
```

## Routing

Use React Router v6:

```typescript
export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/app',
    element: <AppLayout />,
    children: [
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'customers', element: <CustomersListPage /> },
      { path: 'customers/:id', element: <CustomerDetailPage /> },
      // ... etc
    ],
  },
]);
```

## TypeScript

- Strict mode enabled
- All functions have return types
- All data has interfaces
- No `any` types

## Component State

Every feature component should have:

1. **Loading state**: Show spinner while data loads
2. **Empty state**: Show message when no data
3. **Error state**: Show error message if something fails
4. **Data state**: Show the actual data

## Testing

- Unit tests for services
- Component tests for UI
- Run: `npm test`

## Build & Deploy

- `npm run build` creates optimized bundle
- Output in `dist/`
- Ready for static hosting

## Environment Variables

Create `.env.local`:

VITE_API_BASE_URL=http://localhost:3000/api
VITE_OLLAMA_BASE_URL=http://localhost:11434


## Current Phase

Phase numbering below matches `docs/HIVE_TASKS.md` (the authoritative task board), not the illustrative numbering this section previously used.

**Phase 0 (Foundation & Core System Shell) — done, verified by architect-bee:**
- ✅ Vite + React 18 + TypeScript (strict) scaffold, with ESLint and Vitest configured. `npm install`, `npm run build`, `npm run type-check`, `npm run lint`, and `npm run test` all pass with zero errors.
- ✅ Full `src/` folder structure (app, components/{ui,layout,charts,tables,forms,feedback}, features/[15 modules], services, repositories(+mock), stores, types, utils, config, hooks, mock-data, styles) — feature subfolders are placeholders per bee assignment, not built-out logic.
- ✅ Design system tokens (`src/styles/tokens.css`) implementing `docs/DESIGN_SYSTEM.md` exactly — dark values on `:root` (default), light values under `[data-theme="light"]` — wired into `tailwind.config.js` (colors, font sizes/weights, spacing, radius, shadows, breakpoints).
- ✅ `ThemeProvider` (`src/app/providers.tsx`) supporting Dark/Light/System, backed by a persisted Zustand store (`src/stores/themeStore.ts`); `ThemeToggle` UI in the topbar.
- ✅ Base domain types in `src/types/`: `Customer`, `Supplier`, `Product`, `Invoice`, `Quote`, `SalesOrder`, `PurchaseOrder`, `Bill`, `BankAccount`, `BankTransaction`, `JournalEntry`, `Account`, `TaxRate`, `User`, `Role` (+ shared `common.ts` primitives).
- ✅ Repository pattern: generic `IRepository<T>` contract (`src/repositories/IRepository.ts`) and one fully-wired example, `MockCustomerRepository` (`src/repositories/mock/`), consumed only via `CustomerService` → `useCustomers` hook — components never import repositories directly. Per ADR 001 this is an **in-memory** mock, not localStorage-persisted.
- ✅ Router skeleton (`src/app/router.tsx`) using `createBrowserRouter`, with all 14 routes from `docs/ROUTES.md` (paths are authoritative — not the illustrative `/app/*` example previously shown in this doc), each rendering a minimal placeholder page. `RouteGuard` wraps the protected tree with a stub auth check (`src/stores/authStore.ts`); `/login` is public.
- ✅ Loading/Error/Empty state primitives (`src/components/feedback/{Spinner,ErrorState,EmptyState}.tsx`) for other bees to consume.
- ⏳ Not built yet: Executive Dashboard content, Customers/Suppliers/Products modules, and every other feature's real UI, additional mock repositories, sidebar collapse/mobile drawer polish, real authentication.

**Phase 1**: Core business modules (dashboard, customers, suppliers, products & inventory)
**Phase 2**: Transactional modules (sales, purchases, banking, general ledger)
**Phase 3**: Compliance & reporting (tax, expenses, fixed assets, reports, admin)