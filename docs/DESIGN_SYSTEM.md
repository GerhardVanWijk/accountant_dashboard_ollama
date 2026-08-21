# Design System

## Design Direction (Revised 2026-08-20)

Superseding the original dark-charcoal/neon-cyan direction. New reference class:
mainstream SA business accounting software (Smart-It Accounting, Sage Pastel) —
calm, simple, functional over flashy. Concretely:

- **Palette:** pastel/muted tones, not saturated neon. Light mode is the primary
  reference surface (dark mode keeps the same pastel family, just deepened panels).
- **Navigation:** horizontal top bar, not a left sidebar. One row of top-level
  domain tabs (icon + label), each with a dropdown/sub-nav for its child routes
  (e.g. Accounting → Chart of Accounts / Journals / Ledger). Collapses to a
  hamburger menu on mobile.
- **Icons:** one canonical icon per concept, reused everywhere that concept
  appears — see "Icon System" below. Never introduce a second icon for something
  that already has one.
- **Simplicity:** fewer decorative flourishes, generous whitespace, flat surfaces
  (light shadows only), legible at a glance — this is a tool accountants live in
  all day, not a marketing site.

Sources consulted: [Smart-It Accounting dashboard](https://www.smart-it.co.za/features/dashboard/),
[Sage Pastel Accounting](https://www.pastelaccounting-sa.co.za/) — both SA
accounting products using horizontal top nav + widget-card dashboards over
sidebar-heavy layouts.

## Theme

### Light Mode (Default)

```
Background:     #FAF9F6
Panel:          #FFFFFF
Border:         #E6E2DA
Text Primary:   #33363F
Text Secondary: #6B6F76
Text Muted:     #9A9DA3

Primary (Blue):    #8FB8E8
Secondary (Lilac): #C9B8EF
Success (Mint):    #A8DDB5
Warning (Peach):   #F6D29B
Danger (Coral):    #F3AFAF
Info (Sky):        #A9D8F0
```

### Dark Mode

Same pastel family, deepened surfaces so accents keep working as light-toned
accents against a dark ground — not a neon-on-black theme.

```
Background:     #1E2126
Panel:          #262A31
Border:         #383D46
Text Primary:   #E7E5E1
Text Secondary: #A8ACB3
Text Muted:     #767B84

Primary (Blue):    #7FA8D9
Secondary (Lilac): #B7A3E0
Success (Mint):    #86C79A
Warning (Peach):   #E0B876
Danger (Coral):    #E08F8F
Info (Sky):        #82BEE0
```

### Accent Contrast Rule (both modes)

All six accent colors are pastel/light-toned in *both* modes — they must never
carry white text. Any solid-fill surface using an accent color (primary
buttons, active-tab pills, status badges) uses a dark neutral text color:

```
Text-on-Accent: #20242B
```

Accents are for backgrounds, active states, icon tints, and badges — not for
body text (body text always uses the Text Primary/Secondary/Muted tokens,
never a raw accent hex, so it stays readable regardless of theme).

## Navigation Layout

- **Top bar**, full width, fixed. Left: logo/company switcher. Center/left-of-
  center: horizontal row of top-level domain tabs — Dashboard, Sales,
  Purchases, Inventory, Banking, Accounting, Tax, Reports, Admin — each an
  icon + label pair, sourced from `docs/ROUTES.md`'s navigation sections.
  Right: search, theme toggle, user menu.
- A tab with more than one route (e.g. Accounting: CoA/Journals/Ledger) opens
  a dropdown listing its children on click; a single-route tab (e.g.
  Dashboard, Reports) navigates directly.
- The active top-level tab is visually marked with an accent-tinted
  underline/pill, using the Primary accent + Text-on-Accent rule above.
- Below 768px (`md` breakpoint): the tab row collapses behind a hamburger
  trigger that opens a full-height slide-over menu, same hierarchy, single
  column, touch-sized targets (44px minimum).
- The old left `Sidebar` pattern is retired. `src/components/layout/` keeps a
  `Topbar` (nav) + slide-over mobile menu; no persistent left rail.

## Icon System

**Single source of truth:** `src/config/icons.ts` exports one `Icons` registry
object mapping semantic concept keys (`dashboard`, `customers`, `suppliers`,
`invoices`, `bills`, `products`, `warehouses`, `banking`, `accounting`,
`journals`, `ledger`, `tax`, `reports`, `admin`, `users`, `audit`, `settings`,
`search`, `theme`, `logout`, …) to exactly one `lucide-react` icon component
each.

Rules (enforced in `docs/DO_NOT_BREAK.md`):

1. **No feature/page/component file imports from `lucide-react` directly.**
   Only `src/config/icons.ts` and a thin `src/components/ui/Icon.tsx` wrapper
   (`<Icon name="customers" />`) may import from `lucide-react`.
2. **One concept → one icon, everywhere.** If "Customers" already has an icon
   in the registry, every place Customers appears (top nav, dashboard widget,
   quick-action button, breadcrumb) uses that same registry key — never a
   locally-chosen alternative.
3. Extending the registry (a genuinely new concept with no existing icon) is
   fine; redefining what an existing key points to requires updating every
   consumer, so treat registry keys as stable contracts like the domain types.

## Typography

Font Family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto
Font Sizes:
XS: 12px (0.75rem)
SM: 14px (0.875rem)
BASE: 16px (1rem)
LG: 18px (1.125rem)
XL: 20px (1.25rem)
2XL: 24px (1.5rem)
3XL: 30px (1.875rem)
4XL: 36px (2.25rem)

Font Weights:
Light: 300
Regular: 400
Medium: 500
Semibold: 600
Bold: 700


## Spacing

Base unit: 4px (0.25rem)

XS: 4px (0.25rem)
SM: 8px (0.5rem)
MD: 16px (1rem)
LG: 24px (1.5rem)
XL: 32px (2rem)
2XL: 48px (3rem)
3XL: 64px (4rem)


## Shadows

Kept deliberately light — flat surfaces, pastel doesn't want heavy drop shadows.

SM: 0 1px 2px rgba(0, 0, 0, 0.04)
BASE: 0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)
MD: 0 4px 6px rgba(0, 0, 0, 0.05), 0 2px 4px rgba(0, 0, 0, 0.04)
LG: 0 10px 15px rgba(0, 0, 0, 0.06), 0 4px 6px rgba(0, 0, 0, 0.03)


## Border Radius

SM: 2px (0.125rem)
BASE: 4px (0.25rem)
MD: 6px (0.375rem)
LG: 8px (0.5rem)
XL: 12px (0.75rem)
FULL: 9999px


## Breakpoints

Mobile: 320px (xs)
Tablet: 768px (md)
Desktop: 1024px (lg)
Wide: 1280px (xl)
Ultra: 1536px (2xl)


## Financial UI Patterns (Phase 2+)

**IMPORTANT:** All Phase 2+ modules (Sales, Purchases, Banking, Accounting, Tax, Reports) must follow
these patterns. See `mdskills/financial-ui-patterns` SKILL.md for comprehensive reference.

**Why:** Accounting UIs fail in predictable ways (digit shift, raw colors, hard-coded dark theme,
jittery numbers, no accessibility). Production trading/banking UIs (Kraken, Coinbase, Bloomberg,
Robinhood, TradingView) solve this; we adopt their patterns.

### Core Principle: Numbers Must Be Legible, Aligned, and Trustworthy

### Semantic Financial Colors

Use these color tokens for financial signals, NOT raw Tailwind colors:

- `text-positive` / `bg-positive` — gains, income, buy, success (green)
- `text-negative` / `bg-negative` — losses, expenses, sell, danger (red)
- `text-warning-financial` — partial fills, stale data, alerts (amber)
- `text-info-financial` — neutral information, working orders (blue)

**Rule:** NEVER use `text-green-500`, `text-red-500`, or `bg-${color}-500/10` dynamic classes.
Always use semantic tokens from tokens.css.

### Number Formatting

**ALWAYS use `tabular-nums` CSS class on any displaying number:**

```tsx
// ✅ GOOD: tabular-nums locks width, semantic color, explicit sign
<span className="tabular-nums font-medium text-positive" style={{ minWidth: 100, textAlign: 'right' }}>
  +1,234.56
</span>

// ❌ BAD: no tabular-nums = digits shift on update, color not semantic
<span className="text-green-500">
  {value.toFixed(2)}
</span>
```

**Import `formatCurrency`, `formatPercentage`, `formatQuantity`, `formatCompact` from `src/utils/formatFinancial.ts`:**

- `formatCurrency(1234.5)` → `"+1,234.50"` (always show +/- sign)
- `formatPercentage(12.5)` → `"+12.50%"` (always show +/- sign)
- `formatQuantity(100.25)` → `"100.25"` (2 decimals for accounting)
- `formatCompact(1234567890)` → `"1.2B"` (for revenue, caps, volume — NOT prices)

**Precision rules:**
- Currency: 2 decimals
- Percentages: 2 decimals
- Quantities: 2 decimals (accounting context)
- Basis points: 0-1 decimals

### Table Alignment

**Right-align all numbers. Left-align all labels.**

```tsx
// ✅ GOOD: Fixed-width grid, right-aligned numbers
<div className="grid grid-cols-[2fr_120px_120px_120px] gap-2 tabular-nums">
  <div className="text-left">Invoice #INV-001</div>
  <div className="text-right">$1,234.56</div>
  <div className="text-right">$100.00</div>
  <div className="text-right">$1,334.56</div>
</div>

// ❌ BAD: Centered numbers (eye can't compare magnitudes)
<table>
  <tr>
    <td className="text-center">$1,234.56</td>
  </tr>
</table>
```

### Tick Flash (Live Data Updates)

When a price/balance updates, briefly tint the background. CSS-based, no JS animation:

```tsx
// Use <FinancialNumber> component from src/components/ui/FinancialNumber.tsx
<FinancialNumber value={price} format={formatCurrency} showFlash={true} />
```

The component handles:
- Detecting value changes
- 300-500ms tinted background (green for up, red for down)
- No jank at scale
- CSS-only animation

### Monofaces for Tickers/IDs

Use `font-mono` for tickers, order IDs, invoice numbers. This is professional, not dated.

```tsx
<span className="font-mono text-sm">INV-2026-001</span>
<span className="font-mono text-sm">ORD-SKU-XYZ-123</span>
```

### Sign Prefix (Accessibility)

Always show `+` for positive values. Color alone is not enough (8% of men are colorblind).

```tsx
// ✅ GOOD: Color + sign + position
<span className="text-positive">+15.5%</span>

// ❌ BAD: Color only
<span className="text-green-500">15.5%</span>
```

### Stale Data Indicator

If displaying streamed/live data, show staleness when last update > N seconds:

```tsx
// Dim or grey text if data is old
<span className={data.isStale ? 'text-text-muted opacity-50' : 'text-text-primary'}>
  {format(value)}
</span>
```

### Accessibility Checklist (Before Shipping)

- [ ] Every number has `tabular-nums` class
- [ ] Every color is a semantic token, no raw `text-green-*` or `bg-zinc-*`
- [ ] Light theme renders (toggle and verify)
- [ ] Positive returns show `+` prefix
- [ ] Numbers are right-aligned, labels left-aligned
- [ ] Tickers/IDs use `font-mono`
- [ ] No `bg-${var}` dynamic Tailwind classes
- [ ] Color is paired with non-color signal (sign, icon, position)
- [ ] At least 5 rows visible without scroll (density check)

### Components Available

- `FinancialNumber` — Single number with formatting, color, and tick-flash
- `FinancialTableCell` — Grid-based table cell (label/number/status alignment)
- Utilities in `src/utils/formatFinancial.ts` — formatCurrency, formatPercentage, etc.

**See:** `mdskills/financial-ui-patterns/SKILL.md` for full reference (installed via `npx mdskills install`).
