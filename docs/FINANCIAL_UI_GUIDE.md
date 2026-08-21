# Financial UI Patterns Guide

**For Phase 2+ modules:** Sales, Purchases, Banking, Accounting, Tax, Reports, Admin.

This guide shows how to build professional financial UIs following patterns from Bloomberg,
Kraken, Coinbase, TradingView, and Robinhood.

**Why?** Generic AI output for financial UIs fails predictably: digits shift on update, raw
colors break light/dark themes, no accessibility for colorblind users. This guide prevents
those failures.

---

## Core Principle

**Numbers must be legible, aligned, and trustworthy.**

### The Most Common Mistake: No `tabular-nums`

```tsx
// ❌ BREAKS: value goes from "9.99%" to "10.00%" and the whole row reflows!
<span className="text-green-500">
  {value.toFixed(2)}%
</span>

// ✅ GOOD: tabular-nums locks digit width, semantic color, explicit sign, right-aligned
<span
  className="tabular-nums font-medium text-positive"
  style={{ minWidth: 64, textAlign: "right" }}
>
  {value >= 0 ? "+" : ""}{value.toFixed(2)}%
</span>
```

**Just use the `FinancialNumber` component instead:**

```tsx
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatPercentage } from '@/utils/formatFinancial';

<FinancialNumber value={value} format={formatPercentage} minWidth={64} />
```

---

## Quick Start: Display a Financial Value

### Option 1: Single Number (Recommended)

```tsx
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency, formatPercentage } from '@/utils/formatFinancial';

// Currency
<FinancialNumber value={1234.56} format={formatCurrency} minWidth={100} />

// Percentage
<FinancialNumber value={-3.2} format={formatPercentage} showFlash={true} />

// Inverted (expense = negative is bad)
<FinancialNumber value={-500} format={formatCurrency} isInverted={true} />
```

### Option 2: Manual Control (When You Need Custom Styling)

```tsx
import { formatCurrency, getFinancialColorClass } from '@/utils/formatFinancial';

const value = 1234.56;
const colorClass = getFinancialColorClass(value);

<span
  className={`tabular-nums tracking-tight text-sm ${colorClass}`}
  style={{ minWidth: 100, textAlign: "right" }}
>
  {value >= 0 ? "+" : ""}{formatCurrency(value)}
</span>
```

---

## Building Tables with Financial Data

### Pattern: Fixed-Width Grid with Right-Aligned Numbers

```tsx
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import { formatCurrency } from '@/utils/formatFinancial';

// ✅ GOOD: grid-based layout, tabular-nums automatic via FinancialTableCell
<div className="grid grid-cols-[2fr_120px_120px_120px] gap-2 tabular-nums">
  <FinancialTableCell type="label">Invoice #INV-001</FinancialTableCell>
  <FinancialTableCell type="number">
    <FinancialNumber value={1234.56} format={formatCurrency} />
  </FinancialTableCell>
  <FinancialTableCell type="number">
    <FinancialNumber value={100} format={formatCurrency} />
  </FinancialTableCell>
  <FinancialTableCell type="number">
    <FinancialNumber value={1334.56} format={formatCurrency} />
  </FinancialTableCell>
</div>

// Multiple rows
{invoices.map((invoice) => (
  <div key={invoice.id} className="grid grid-cols-[2fr_120px_120px_120px] gap-2 tabular-nums">
    <FinancialTableCell type="label">{invoice.number}</FinancialTableCell>
    <FinancialTableCell type="number">
      <FinancialNumber value={invoice.subtotal} format={formatCurrency} />
    </FinancialTableCell>
    <FinancialTableCell type="number">
      <FinancialNumber value={invoice.tax} format={formatCurrency} />
    </FinancialTableCell>
    <FinancialTableCell type="number">
      <FinancialNumber value={invoice.total} format={formatCurrency} />
    </FinancialTableCell>
  </div>
))}
```

**Key points:**
- Use `grid grid-cols-[...]` with fixed widths (e.g., `120px` for each number column)
- Wrap grid in `tabular-nums` class
- Use `text-left` for labels, `text-right` for numbers
- Minimum 5 rows visible without scroll (density check)

---

## Formatting Numbers

Always import from `src/utils/formatFinancial.ts`:

### `formatCurrency(value, decimals)`

For amounts of money. Always shows +/- sign.

```tsx
import { formatCurrency } from '@/utils/formatFinancial';

formatCurrency(1234.5)     // "+1,234.50"
formatCurrency(-567.89)    // "-567.89"
formatCurrency(0)          // "+0.00"
```

### `formatPercentage(value, decimals)`

For returns, growth rates, taxes. Always shows +/- sign.

```tsx
import { formatPercentage } from '@/utils/formatFinancial';

formatPercentage(12.5)     // "+12.50%"
formatPercentage(-3.2)     // "-3.20%"
```

### `formatQuantity(value, type)`

For line items, stock counts. No sign prefix (quantities are unsigned).

```tsx
import { formatQuantity } from '@/utils/formatFinancial';

formatQuantity(100.25, 'accounting')  // "100.25"
formatQuantity(1000000.5)             // "1,000,000.50"
```

### `formatCompact(value, decimals)`

For revenue totals, market cap, volume. NOT for prices or balances.

```tsx
import { formatCompact } from '@/utils/formatFinancial';

formatCompact(1234567890)   // "1.2B"
formatCompact(847000000)    // "847M"
formatCompact(5234000)      // "5.2M"
formatCompact(1234)         // "1"
```

---

## Color Tokens

**NEVER use raw Tailwind colors.** Always use semantic tokens.

| Situation | Class | Use When |
|-----------|-------|----------|
| Gains, income, buy | `text-positive` | Positive P&L, profit, revenue, buy orders |
| Losses, expense, sell | `text-negative` | Negative P&L, costs, refunds, sell orders |
| Partial, alert | `text-warning-financial` | Partial fills, stale data (>N seconds old) |
| Neutral info | `text-info-financial` | Neutral signals, information, working status |

### Background Tint (Tick Flash)

When prices update, use tinted background:

```tsx
// ✅ Automatic via FinancialNumber component
<FinancialNumber value={price} format={formatCurrency} showFlash={true} />

// ✅ Manual CSS (if needed)
<span
  data-flash="up"
  className="transition-colors duration-300 data-[flash=up]:bg-positive/15"
>
  {format(value)}
</span>
```

---

## Building Invoice/Bill/Order Tables

### Example: Invoice Line Items

```tsx
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import { formatCurrency, formatQuantity } from '@/utils/formatFinancial';

export function InvoiceLineItemsTable({ invoice }) {
  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="grid grid-cols-[2fr_80px_100px_100px_100px] gap-2 border-b border-border px-4 py-2 font-semibold">
        <FinancialTableCell type="label">Description</FinancialTableCell>
        <FinancialTableCell type="number">Qty</FinancialTableCell>
        <FinancialTableCell type="number">Unit Price</FinancialTableCell>
        <FinancialTableCell type="number">Tax</FinancialTableCell>
        <FinancialTableCell type="number">Total</FinancialTableCell>
      </div>

      {/* Rows */}
      {invoice.lines.map((line) => (
        <div
          key={line.id}
          className="grid grid-cols-[2fr_80px_100px_100px_100px] gap-2 px-4 py-2 border-b border-border/50"
        >
          <FinancialTableCell type="label">{line.description}</FinancialTableCell>
          <FinancialTableCell type="number">
            {formatQuantity(line.quantity)}
          </FinancialTableCell>
          <FinancialTableCell type="number">
            <FinancialNumber value={line.unitPrice} format={formatCurrency} />
          </FinancialTableCell>
          <FinancialTableCell type="number">
            <FinancialNumber value={line.tax} format={formatCurrency} />
          </FinancialTableCell>
          <FinancialTableCell type="number">
            <FinancialNumber value={line.total} format={formatCurrency} />
          </FinancialTableCell>
        </div>
      ))}

      {/* Totals */}
      <div className="grid grid-cols-[2fr_80px_100px_100px_100px] gap-2 px-4 py-3 bg-panel border-t-2 border-border font-semibold">
        <FinancialTableCell type="label"></FinancialTableCell>
        <FinancialTableCell type="number"></FinancialTableCell>
        <FinancialTableCell type="number"></FinancialTableCell>
        <FinancialTableCell type="number">Subtotal</FinancialTableCell>
        <FinancialTableCell type="number">
          <FinancialNumber value={invoice.subtotal} format={formatCurrency} />
        </FinancialTableCell>
      </div>
    </div>
  );
}
```

---

## Building P&L Reports

### Example: P&L Statement

```tsx
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency, formatPercentage } from '@/utils/formatFinancial';

export function ProfitLossStatement({ pnl }) {
  const rows = [
    { label: 'Revenue', value: pnl.revenue, percent: 100 },
    { label: 'Cost of Goods Sold', value: -pnl.cogs, percent: -(pnl.cogs / pnl.revenue) * 100, isInverted: true },
    { label: 'Gross Profit', value: pnl.grossProfit, percent: (pnl.grossProfit / pnl.revenue) * 100, isBold: true },
    { label: 'Operating Expenses', value: -pnl.opex, percent: -(pnl.opex / pnl.revenue) * 100, isInverted: true },
    { label: 'Net Income', value: pnl.netIncome, percent: (pnl.netIncome / pnl.revenue) * 100, isBold: true },
  ];

  return (
    <div className="space-y-0 tabular-nums">
      {rows.map((row, idx) => (
        <div
          key={idx}
          className={`grid grid-cols-[1fr_150px_150px] gap-4 px-4 py-2 ${
            row.isBold ? 'font-semibold bg-primary/10 border-y border-border' : 'text-text-secondary'
          }`}
        >
          <div>{row.label}</div>
          <div className="text-right">
            <FinancialNumber
              value={row.value}
              format={formatCurrency}
              isInverted={row.isInverted}
            />
          </div>
          <div className="text-right">
            <FinancialNumber
              value={row.percent}
              format={formatPercentage}
              isInverted={row.isInverted}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## Building Bank Transaction Lists

```tsx
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import { format } from 'date-fns';

export function BankTransactionList({ transactions }) {
  return (
    <div className="space-y-0 text-sm">
      {/* Header */}
      <div className="grid grid-cols-[100px_1fr_100px_100px_100px] gap-3 px-4 py-2 bg-panel border-b font-semibold">
        <div>Date</div>
        <div>Description</div>
        <div className="text-right">Debit</div>
        <div className="text-right">Credit</div>
        <div className="text-right">Balance</div>
      </div>

      {/* Rows */}
      {transactions.map((txn) => (
        <div
          key={txn.id}
          className="grid grid-cols-[100px_1fr_100px_100px_100px] gap-3 px-4 py-2 border-b border-border/50 hover:bg-primary/5"
        >
          <div className="font-mono text-text-secondary">
            {format(new Date(txn.date), 'dd MMM')}
          </div>
          <div>{txn.description}</div>
          <div className="text-right">
            {txn.type === 'debit' ? (
              <FinancialNumber value={txn.amount} format={formatCurrency} isInverted={true} />
            ) : (
              '—'
            )}
          </div>
          <div className="text-right">
            {txn.type === 'credit' ? (
              <FinancialNumber value={txn.amount} format={formatCurrency} />
            ) : (
              '—'
            )}
          </div>
          <div className="text-right">
            <FinancialNumber value={txn.balance} format={formatCurrency} />
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## Tick Flash (Live Data Updates)

The `FinancialNumber` component handles this automatically:

```tsx
// Automatically flashes when price updates
<FinancialNumber
  value={streamedPrice}
  format={formatCurrency}
  showFlash={true}  // default
/>
```

**How it works:**
- Detects value change
- 300-500ms tinted background (green for up, red for down)
- CSS-based, no JS animation library
- Scales to hundreds of cells without jank

**Custom flash (if needed):**

```tsx
const [flash, setFlash] = useState<'up' | 'down' | null>(null);

useEffect(() => {
  if (value === prevValue) return;
  setFlash(value > prevValue ? 'up' : 'down');
  const timeout = setTimeout(() => setFlash(null), 400);
  return () => clearTimeout(timeout);
}, [value]);

<span
  data-flash={flash}
  className="transition-colors data-[flash=up]:bg-positive/15 data-[flash=down]:bg-negative/15"
>
  {format(value)}
</span>
```

---

## Accessibility Checklist

Before shipping any financial UI:

- [ ] Every number has `tabular-nums` class (no digit shift on update)
- [ ] Every color is a semantic token (`text-positive`, `text-negative`, etc.)
- [ ] Light theme renders correctly (toggle and verify)
- [ ] Dark theme renders correctly (toggle and verify)
- [ ] Positive values show `+` prefix (not color-only)
- [ ] Numbers are right-aligned, labels are left-aligned
- [ ] Tickers/IDs use `font-mono`
- [ ] No raw Tailwind colors (`text-green-500`, `bg-zinc-950`)
- [ ] No dynamic Tailwind classes (`bg-${color}-500/10`)
- [ ] At least 5 rows visible without scroll (density check)
- [ ] Tested with colorblind mode (Chrome DevTools)

---

## References

- `mdskills/financial-ui-patterns` — Comprehensive skill (run `npx mdskills install`)
- `docs/DESIGN_SYSTEM.md` — Full design system, Financial UI section
- `docs/DO_NOT_BREAK.md` — Financial UI Patterns checklist
- `src/utils/formatFinancial.ts` — Formatting utilities
- `src/components/ui/FinancialNumber.tsx` — Number component
- `src/components/tables/FinancialTableCell.tsx` — Table cell component

---

## Common Mistakes

| Mistake | Why | Fix |
|---------|-----|-----|
| No `tabular-nums` | Digits shift width on update, row reflows | Always use `tabular-nums` class |
| `text-green-500` | Breaks light theme, not a semantic token | Use `text-positive` |
| `bg-${color}-500/10` | JIT doesn't render dynamic classes | Use static class map or FinancialNumber |
| Centered numbers | Eye can't compare magnitudes | Right-align all numbers |
| No `+` prefix | Color-only breaks for colorblind users | Always show `+` for positive values |
| `formatCompact()` for prices | $1.2B doesn't make sense for a balance | Use `formatCurrency()` for prices/balances |
| Hard-coded dark theme | Breaks light theme | Use CSS variables in tokens.css |
| Mono font not used | Reduces professionalism | Use `font-mono` for tickers/IDs |

---

## Questions?

Ask the Queen Bee or check `mdskills/financial-ui-patterns` directly.
