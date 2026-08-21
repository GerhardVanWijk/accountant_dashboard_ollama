# Phase 2 Example Implementation — Invoice Module

This is a concrete example showing exactly how to implement financial UI patterns in Phase 2.

**Use this as a template for:** Invoices, Bills, Orders, Transactions, GL Ledger, P&L, etc.

---

## Invoice List Page Example

This shows a professional invoice table using the financial UI patterns.

### Component: `src/features/sales/components/InvoiceList.tsx`

```tsx
import React, { useState } from 'react';
import { formatCurrency, formatPercentage } from '@/utils/formatFinancial';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import { format } from 'date-fns';

interface Invoice {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  date: Date;
  dueDate: Date;
  subtotal: number;
  tax: number;
  total: number;
  paid: number;
  status: 'draft' | 'sent' | 'paid' | 'partial' | 'overdue';
}

interface InvoiceListProps {
  invoices: Invoice[];
  onSelect?: (id: string) => void;
  isLoading?: boolean;
  error?: string;
}

export const InvoiceList: React.FC<InvoiceListProps> = ({
  invoices,
  onSelect,
  isLoading = false,
  error,
}) => {
  if (isLoading) {
    return <div className="p-8 text-center text-text-muted">Loading invoices...</div>;
  }

  if (error) {
    return <div className="p-8 text-danger">{error}</div>;
  }

  if (invoices.length === 0) {
    return <div className="p-8 text-center text-text-muted">No invoices yet</div>;
  }

  // Calculate totals for footer
  const totals = {
    subtotal: invoices.reduce((sum, inv) => sum + inv.subtotal, 0),
    tax: invoices.reduce((sum, inv) => sum + inv.tax, 0),
    total: invoices.reduce((sum, inv) => sum + inv.total, 0),
    paid: invoices.reduce((sum, inv) => sum + inv.paid, 0),
    outstanding: invoices.reduce((sum, inv) => sum + (inv.total - inv.paid), 0),
  };

  const percentPaid = (totals.paid / totals.total) * 100;

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Total Invoices</div>
          <div className="text-2xl font-semibold">{invoices.length}</div>
        </div>
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Total Amount</div>
          <FinancialNumber
            value={totals.total}
            format={formatCurrency}
            className="text-2xl font-semibold"
          />
        </div>
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Amount Paid</div>
          <FinancialNumber
            value={totals.paid}
            format={formatCurrency}
            className="text-2xl font-semibold text-positive"
          />
        </div>
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Outstanding</div>
          <FinancialNumber
            value={totals.outstanding}
            format={formatCurrency}
            className="text-2xl font-semibold text-negative"
            isInverted={false}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-panel rounded-lg border border-border overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-[100px_150px_100px_100px_100px_100px_100px_80px] gap-3 px-4 py-3 bg-primary/10 border-b border-border font-semibold text-sm sticky top-0">
          <FinancialTableCell type="label">Date</FinancialTableCell>
          <FinancialTableCell type="label">Invoice #</FinancialTableCell>
          <FinancialTableCell type="label">Customer</FinancialTableCell>
          <FinancialTableCell type="number">Subtotal</FinancialTableCell>
          <FinancialTableCell type="number">Tax</FinancialTableCell>
          <FinancialTableCell type="number">Total</FinancialTableCell>
          <FinancialTableCell type="number">Paid</FinancialTableCell>
          <FinancialTableCell type="status">Status</FinancialTableCell>
        </div>

        {/* Table Rows */}
        {invoices.map((invoice) => (
          <div
            key={invoice.id}
            className="grid grid-cols-[100px_150px_100px_100px_100px_100px_100px_80px] gap-3 px-4 py-3 border-b border-border/50 hover:bg-primary/5 cursor-pointer transition-colors"
            onClick={() => onSelect?.(invoice.id)}
          >
            <FinancialTableCell type="label" className="text-text-secondary">
              {format(invoice.date, 'dd MMM yy')}
            </FinancialTableCell>

            <FinancialTableCell type="label" className="font-mono text-sm font-semibold">
              {invoice.number}
            </FinancialTableCell>

            <FinancialTableCell type="label" className="text-text-secondary">
              {invoice.customerName}
            </FinancialTableCell>

            <FinancialTableCell type="number">
              <FinancialNumber
                value={invoice.subtotal}
                format={formatCurrency}
                showFlash={false}
              />
            </FinancialTableCell>

            <FinancialTableCell type="number">
              <FinancialNumber
                value={invoice.tax}
                format={formatCurrency}
                showFlash={false}
              />
            </FinancialTableCell>

            <FinancialTableCell type="number" className="font-semibold">
              <FinancialNumber
                value={invoice.total}
                format={formatCurrency}
                showFlash={false}
              />
            </FinancialTableCell>

            <FinancialTableCell type="number">
              <FinancialNumber
                value={invoice.paid}
                format={formatCurrency}
                showFlash={false}
                className="text-positive"
              />
            </FinancialTableCell>

            <FinancialTableCell
              type="status"
              className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusClass(
                invoice.status,
              )}`}
            >
              {getStatusLabel(invoice.status)}
            </FinancialTableCell>
          </div>
        ))}

        {/* Table Footer — Totals */}
        <div className="grid grid-cols-[100px_150px_100px_100px_100px_100px_100px_80px] gap-3 px-4 py-3 bg-panel border-t-2 border-border font-semibold">
          <FinancialTableCell type="label"></FinancialTableCell>
          <FinancialTableCell type="label"></FinancialTableCell>
          <FinancialTableCell type="label">TOTAL</FinancialTableCell>
          <FinancialTableCell type="number">
            <FinancialNumber value={totals.subtotal} format={formatCurrency} />
          </FinancialTableCell>
          <FinancialTableCell type="number">
            <FinancialNumber value={totals.tax} format={formatCurrency} />
          </FinancialTableCell>
          <FinancialTableCell type="number">
            <FinancialNumber value={totals.total} format={formatCurrency} />
          </FinancialTableCell>
          <FinancialTableCell type="number">
            <FinancialNumber value={totals.paid} format={formatCurrency} className="text-positive" />
          </FinancialTableCell>
          <FinancialTableCell type="status"></FinancialTableCell>
        </div>
      </div>

      {/* Statistics */}
      <div className="bg-panel p-4 rounded-lg border border-border">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-text-muted">Collection Rate</div>
            <FinancialNumber
              value={percentPaid}
              format={formatPercentage}
              className="text-xl font-semibold"
            />
          </div>
          <div className="w-48 h-2 bg-background rounded-full overflow-hidden">
            <div
              className="h-full bg-positive/80 transition-all duration-300"
              style={{ width: `${Math.min(percentPaid, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

function getStatusClass(status: string): string {
  const classes = {
    draft: 'bg-info-financial/20 text-info-financial',
    sent: 'bg-warning-financial/20 text-warning-financial',
    paid: 'bg-positive/20 text-positive',
    partial: 'bg-warning-financial/20 text-warning-financial',
    overdue: 'bg-negative/20 text-negative',
  };
  return classes[status as keyof typeof classes] || '';
}

function getStatusLabel(status: string): string {
  const labels = {
    draft: 'Draft',
    sent: 'Sent',
    paid: 'Paid',
    partial: 'Partial',
    overdue: 'Overdue',
  };
  return labels[status as keyof typeof labels] || status;
}
```

---

## Invoice Detail Page Example

When user clicks on an invoice, show the full details with line items.

### Component: `src/features/sales/components/InvoiceDetail.tsx`

```tsx
import React from 'react';
import { formatCurrency } from '@/utils/formatFinancial';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import { format } from 'date-fns';

interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  lineTotal: number;
  lineTax: number;
  lineGrossTotal: number;
}

interface InvoiceDetailProps {
  number: string;
  date: Date;
  dueDate: Date;
  customerName: string;
  customerAddress: string;
  companyName: string;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  tax: number;
  total: number;
  notes?: string;
}

export const InvoiceDetail: React.FC<InvoiceDetailProps> = ({
  number,
  date,
  dueDate,
  customerName,
  customerAddress,
  companyName,
  lineItems,
  subtotal,
  tax,
  total,
  notes,
}) => {
  return (
    <div className="max-w-4xl mx-auto bg-panel p-8 rounded-lg border border-border">
      {/* Header */}
      <div className="flex justify-between items-start mb-8 pb-8 border-b border-border">
        <div>
          <div className="text-3xl font-bold mb-2">{companyName}</div>
          <div className="text-text-secondary">Tax Invoice</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-xl font-semibold">{number}</div>
          <div className="text-sm text-text-muted">
            {format(date, 'dd MMMM yyyy')}
          </div>
        </div>
      </div>

      {/* Customer & Dates */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        <div>
          <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Bill To</div>
          <div className="font-semibold mb-1">{customerName}</div>
          <div className="text-sm text-text-secondary whitespace-pre-line">
            {customerAddress}
          </div>
        </div>
        <div>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wide">Invoice Date</div>
              <div className="font-semibold">{format(date, 'dd MMMM yyyy')}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wide">Due Date</div>
              <div className="font-semibold">{format(dueDate, 'dd MMMM yyyy')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Line Items Table */}
      <div className="mb-8">
        {/* Header */}
        <div className="grid grid-cols-[2fr_80px_100px_60px_100px_100px] gap-3 px-4 py-3 bg-primary/10 border border-border border-b-0 font-semibold text-sm">
          <FinancialTableCell type="label">Description</FinancialTableCell>
          <FinancialTableCell type="number">Qty</FinancialTableCell>
          <FinancialTableCell type="number">Unit Price</FinancialTableCell>
          <FinancialTableCell type="number">Tax %</FinancialTableCell>
          <FinancialTableCell type="number">Net Total</FinancialTableCell>
          <FinancialTableCell type="number">Gross Total</FinancialTableCell>
        </div>

        {/* Rows */}
        {lineItems.map((item) => (
          <div
            key={item.id}
            className="grid grid-cols-[2fr_80px_100px_60px_100px_100px] gap-3 px-4 py-3 border-b border-border text-sm"
          >
            <FinancialTableCell type="label">{item.description}</FinancialTableCell>
            <FinancialTableCell type="number" className="text-text-secondary">
              {item.quantity.toFixed(2)}
            </FinancialTableCell>
            <FinancialTableCell type="number">
              <FinancialNumber value={item.unitPrice} format={formatCurrency} />
            </FinancialTableCell>
            <FinancialTableCell type="number" className="text-text-secondary">
              {item.taxRate.toFixed(1)}%
            </FinancialTableCell>
            <FinancialTableCell type="number">
              <FinancialNumber value={item.lineTotal} format={formatCurrency} />
            </FinancialTableCell>
            <FinancialTableCell type="number" className="font-semibold">
              <FinancialNumber value={item.lineGrossTotal} format={formatCurrency} />
            </FinancialTableCell>
          </div>
        ))}

        {/* Totals */}
        <div className="grid grid-cols-[2fr_80px_100px_60px_100px_100px] gap-3 px-4 py-3 bg-background border-t-2 border-border font-semibold">
          <FinancialTableCell type="label"></FinancialTableCell>
          <FinancialTableCell type="number"></FinancialTableCell>
          <FinancialTableCell type="number"></FinancialTableCell>
          <FinancialTableCell type="number"></FinancialTableCell>
          <FinancialTableCell type="number">Subtotal</FinancialTableCell>
          <FinancialTableCell type="number">
            <FinancialNumber value={subtotal} format={formatCurrency} />
          </FinancialTableCell>
        </div>

        <div className="grid grid-cols-[2fr_80px_100px_60px_100px_100px] gap-3 px-4 py-3 bg-background border-b border-border">
          <FinancialTableCell type="label"></FinancialTableCell>
          <FinancialTableCell type="number"></FinancialTableCell>
          <FinancialTableCell type="number"></FinancialTableCell>
          <FinancialTableCell type="number"></FinancialTableCell>
          <FinancialTableCell type="number">Tax/VAT</FinancialTableCell>
          <FinancialTableCell type="number">
            <FinancialNumber value={tax} format={formatCurrency} />
          </FinancialTableCell>
        </div>

        <div className="grid grid-cols-[2fr_80px_100px_60px_100px_100px] gap-3 px-4 py-3 bg-positive/10 border-b-2 border-border font-bold text-lg">
          <FinancialTableCell type="label"></FinancialTableCell>
          <FinancialTableCell type="number"></FinancialTableCell>
          <FinancialTableCell type="number"></FinancialTableCell>
          <FinancialTableCell type="number"></FinancialTableCell>
          <FinancialTableCell type="number">TOTAL DUE</FinancialTableCell>
          <FinancialTableCell type="number" className="text-positive">
            <FinancialNumber value={total} format={formatCurrency} />
          </FinancialTableCell>
        </div>
      </div>

      {/* Notes */}
      {notes && (
        <div className="mb-8">
          <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Notes</div>
          <div className="text-sm text-text-secondary whitespace-pre-wrap">{notes}</div>
        </div>
      )}

      {/* Footer */}
      <div className="pt-8 border-t border-border text-xs text-text-muted">
        <div>Thank you for your business!</div>
        <div className="mt-4">Please make payment by {format(dueDate, 'dd MMMM yyyy')}</div>
      </div>
    </div>
  );
};
```

---

## Key Patterns Used in This Example

### ✅ Financial Table Layout
- `grid grid-cols-[2fr_80px_100px...]` — fixed-width columns
- First column is `2fr` (flexible), others are fixed px
- Ensures numbers stay aligned and don't reflow

### ✅ FinancialNumber Component
```tsx
<FinancialNumber value={1234.56} format={formatCurrency} />
// Renders: "+1,234.56" (with tabular-nums, semantic color, tick-flash)
```

### ✅ Right-Aligned Numbers
```tsx
<FinancialTableCell type="number">
  <FinancialNumber value={amount} format={formatCurrency} />
</FinancialTableCell>
```

### ✅ Semantic Colors
```tsx
// Positive (income, paid)
<FinancialNumber value={123.45} format={formatCurrency} className="text-positive" />

// Negative (expense, outstanding)
<FinancialNumber value={-567.89} format={formatCurrency} className="text-negative" />
```

### ✅ Status Pills
```tsx
<FinancialTableCell type="status" className="bg-positive/20 text-positive">
  Paid
</FinancialTableCell>
```

### ✅ Font-Mono for IDs
```tsx
<div className="font-mono text-sm font-semibold">{invoiceNumber}</div>
// Renders invoice numbers in monospace font (professional)
```

### ✅ Responsive Tailwind Grid
```tsx
// Desktop: full grid
// Tablet/Mobile: stacked or simplified
```

---

## Testing This Component

```tsx
const mockInvoice: Invoice = {
  id: '1',
  number: 'INV-2026-001',
  customerId: 'cust-1',
  customerName: 'Acme Corp',
  date: new Date(2026, 7, 15),
  dueDate: new Date(2026, 8, 15),
  subtotal: 10000,
  tax: 1500,
  total: 11500,
  paid: 0,
  status: 'sent',
};

// In your test
<InvoiceList invoices={[mockInvoice]} />
```

Verify:
- ✅ Numbers don't shift when you update values (tabular-nums)
- ✅ Colors are correct (green for positive, red for negative)
- ✅ All numbers are right-aligned
- ✅ Light theme and dark theme both work
- ✅ Mobile responsive (test at 320px)

---

## Apply This Pattern To

- **Sales:** Invoices, Orders, Quotes, Credit Notes
- **Purchases:** Bills, POs, Payment Register
- **Banking:** Transaction list, Reconciliation
- **Accounting:** GL Ledger, Trial Balance, Journal
- **Reports:** P&L, Balance Sheet, Cash Flow
- **Tax:** VAT Reconciliation, Tax Liability

All follow the same patterns!

---

## Summary

This example shows:
1. ✅ Professional invoice list table
2. ✅ Financial number formatting (`FinancialNumber` component)
3. ✅ Semantic colors (positive/negative)
4. ✅ Proper table alignment (right-aligned numbers)
5. ✅ Status indicators
6. ✅ Header and footer calculations
7. ✅ Detail view with line items
8. ✅ Printable/exportable layout

**Copy this pattern and adapt it for your Phase 2 module!**
