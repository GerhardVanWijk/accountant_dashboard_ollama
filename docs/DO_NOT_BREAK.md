# DO NOT BREAK

This file lists things that worker bees MUST NOT change.

## Routes

DO NOT:
- Remove existing routes
- Rename routes without updating navigation
- Change route parameters without updating consumers
- Break the /app/* protected route structure

## Domain Types

DO NOT:
- Rename domain interfaces without updating all references
- Change the shape of core types (Customer, Invoice, Product, etc.)
- Remove required fields from types without discussion

## Repositories

DO NOT:
- Create a second data access layer
- Bypass repositories in services
- Have components import repositories directly
- Hardcode API calls in components

## State Management

DO NOT:
- Introduce a second state management library (we use Zustand)
- Create global state in component files
- Put all state in React Context (use Zustand for large state)
- Prop drill more than 2 levels deep

## Component Architecture

DO NOT:
- Put business logic in JSX
- Import services directly into components
- Create fake data inside components
- Hardcode values that should be configurable
- Make components do multiple things (separation of concern)

## Styling

DO NOT:
- Use inline styles (use Tailwind classes)
- Create multiple CSS frameworks (we use Tailwind CSS)
- Hardcode colors (use design tokens)
- Break responsive design (test mobile, tablet, desktop)
- Introduce new font families (use system fonts)
- Put white/light text directly on an accent color (Primary/Secondary/Success/
  Warning/Danger/Info are all pastel/light-toned in both themes — text on an
  accent-filled surface always uses the Text-on-Accent token, per
  `docs/DESIGN_SYSTEM.md`)
- Re-introduce a persistent left sidebar — navigation is the horizontal top
  bar defined in `docs/DESIGN_SYSTEM.md`

## Icons

DO NOT:
- Import from `lucide-react` in any feature/page/component file — only
  `src/config/icons.ts` and `src/components/ui/Icon.tsx` may import it
  directly
- Pick a different icon for a concept that already has one in the `Icons`
  registry — reuse the existing registry key
- Add a new registry key without checking whether an existing key already
  covers the concept

## Financial UI Patterns (Phase 2+)

**CRITICAL:** All Phase 2+ modules must follow these patterns. See `docs/DESIGN_SYSTEM.md`
and `mdskills/financial-ui-patterns/SKILL.md`.

DO NOT:
- Display any number without `tabular-nums` class (digits will shift on update)
- Use raw Tailwind color classes for financial data (`text-green-500`, `text-red-500`,
  `bg-zinc-950`) — ALWAYS use semantic tokens: `text-positive`, `text-negative`,
  `text-warning-financial`, `text-info-financial`
- Use dynamic Tailwind classes like `bg-${color}-500/10` — they won't render. Use
  static class maps instead.
- Center numbers in tables (eye can't compare magnitudes) — right-align all numbers
- Omit `+` prefix on positive values (color-only is not accessible to colorblind users)
- Format prices/balances with `formatCompact()` — use `formatCurrency()` instead
- Hard-code dark theme — always define colors via CSS variables in tokens.css
- Display financial data (invoices, transactions, P&L) in light theme only
- Use regular fonts for tickers/order IDs — use `font-mono`
- Show P&L without sign (investors compare magnitudes, confused by missing `+`)
- Create new financial display components without using `FinancialNumber` or
  `FinancialTableCell`

## Financial Number Display Checklist

Before shipping any table/report/widget with numbers:

- ✅ Every numeric value has `tabular-nums` class
- ✅ Every number uses semantic token color: `text-positive` or `text-negative`
- ✅ Positive values show `+` prefix (use `formatCurrency`, `formatPercentage`, etc.)
- ✅ Numbers are right-aligned, labels left-aligned
- ✅ Tickers/IDs use `font-mono`
- ✅ Light theme and dark theme both display correctly
- ✅ No raw Tailwind colors, no `bg-${var}` dynamic classes

## Tax & Accounting Logic

DO NOT:
- Hardcode tax rates in components
- Hardcode company-specific rules in calculations
- Put accounting logic in UI files
- Hardcode currencies

These should be in services or configuration.

## Inventory & Stock

DO NOT:
- Hardcode stock quantities in UI
- Make stock UI calculations (stock math should be in services)
- Create stock movements without logging them
- Update quantities directly (always use stock movement ledger)

## Build & Quality

DO NOT:
- Commit code that doesn't compile (npm run build must pass)
- Add TypeScript errors (npm run lint must pass)
- Leave console.error() in production code
- Remove or break existing tests
- Introduce security vulnerabilities

## Definition of Done

DO NOT mark a module complete unless ALL of these exist:

1. ✅ Route exists
2. ✅ Navigation exists
3. ✅ List page exists
4. ✅ Create page/modal exists
5. ✅ Edit functionality exists
6. ✅ View/detail page exists
7. ✅ Search exists (where appropriate)
8. ✅ Filtering exists (where appropriate)
9. ✅ Sorting exists (where appropriate)
10. ✅ Validation exists
11. ✅ Empty state exists
12. ✅ Loading state exists
13. ✅ Error state exists
14. ✅ Mobile layout works
15. ✅ Dark mode works
16. ✅ Light mode works
17. ✅ Mock repository works
18. ✅ Types are defined
19. ✅ Tests exist
20. ✅ Build succeeds

If ANY of these are missing, the module is NOT done.

## Code Review Checklist

QA Bee must verify:

- ✅ npm run build passes
- ✅ npm run lint passes
- ✅ npm run type-check passes
- ✅ No broken imports
- ✅ No unused variables
- ✅ All new routes are in router.tsx
- ✅ Navigation updated for new routes
- ✅ All states (loading, error, empty) exist
- ✅ Mobile responsive
- ✅ Dark mode works
- ✅ Light mode works
- ✅ No hardcoded values
- ✅ No console.error in code
- ✅ No fake buttons (every button does something)

## Integration Checklist

Integration Bee must verify:

- ✅ Routes connect between modules
- ✅ Navigation links all work
- ✅ Type conflicts resolved
- ✅ No duplicate repositories
- ✅ Data flows correctly
- ✅ Styling consistent
- ✅ All states work across modules
- ✅ Permissions enforced
- ✅ Mobile layout works between modules

## Accountability

If a bee breaks any of these rules:
1. QA Bee catches it in validation
2. Work is sent back
3. Worker bee must fix before approval

The Queen enforces this.