import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { formatCurrency } from '@/utils/formatFinancial';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import type { Bill } from '@/types';

interface BillListProps {
  bills: Bill[];
  onSelect?: (id: string) => void;
  isLoading?: boolean;
  error?: string;
}

export const BillList: React.FC<BillListProps> = ({
  bills,
  onSelect,
  isLoading = false,
  error,
}) => {
  const [sortBy, setSortBy] = useState<'date' | 'number' | 'amount'>('date');
  const [sortDesc, setSortDesc] = useState(true);

  // Sort bills (must be before any early returns due to React Hooks rules)
  const sortedBills = useMemo(() => {
    const sorted = [...bills];
    sorted.sort((a, b) => {
      if (sortBy === 'number') {
        const comparison = a.billNumber.localeCompare(b.billNumber);
        return sortDesc ? -comparison : comparison;
      } else if (sortBy === 'amount') {
        return sortDesc ? b.total - a.total : a.total - b.total;
      } else {
        // Default to date
        const comparison = a.issueDate.localeCompare(b.issueDate);
        return sortDesc ? -comparison : comparison;
      }
    });
    return sorted;
  }, [bills, sortBy, sortDesc]);

  // Calculate totals for footer
  const totals = {
    subtotal: sortedBills.reduce((sum, bill) => sum + bill.subtotal, 0),
    tax: sortedBills.reduce((sum, bill) => sum + bill.taxTotal, 0),
    total: sortedBills.reduce((sum, bill) => sum + bill.total, 0),
    paid: sortedBills.reduce((sum, bill) => sum + bill.amountPaid, 0),
    outstanding: sortedBills.reduce((sum, bill) => sum + (bill.total - bill.amountPaid), 0),
  };

  const percentPaid = (totals.paid / totals.total) * 100;

  if (isLoading) {
    return <div className="p-8 text-center text-text-muted">Loading bills...</div>;
  }

  if (error) {
    return <div className="p-8 text-danger">{error}</div>;
  }

  if (bills.length === 0) {
    return <div className="p-8 text-center text-text-muted">No bills yet</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Total Bills</div>
          <div className="text-2xl font-semibold">{sortedBills.length}</div>
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
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-panel rounded-lg border border-border overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-[100px_150px_150px_100px_100px_100px_100px_80px] gap-3 px-4 py-3 bg-primary/10 border-b border-border font-semibold text-sm sticky top-0 tabular-nums">
          <FinancialTableCell type="label">
            <button
              onClick={() => {
                if (sortBy === 'date') setSortDesc(!sortDesc);
                else setSortBy('date');
              }}
              className="hover:text-primary"
            >
              Date {sortBy === 'date' && (sortDesc ? '↓' : '↑')}
            </button>
          </FinancialTableCell>
          <FinancialTableCell type="label">
            <button
              onClick={() => {
                if (sortBy === 'number') setSortDesc(!sortDesc);
                else setSortBy('number');
              }}
              className="hover:text-primary"
            >
              Bill # {sortBy === 'number' && (sortDesc ? '↓' : '↑')}
            </button>
          </FinancialTableCell>
          <FinancialTableCell type="label">Supplier</FinancialTableCell>
          <FinancialTableCell type="number">Subtotal</FinancialTableCell>
          <FinancialTableCell type="number">Tax</FinancialTableCell>
          <FinancialTableCell type="number">
            <button
              onClick={() => {
                if (sortBy === 'amount') setSortDesc(!sortDesc);
                else setSortBy('amount');
              }}
              className="hover:text-primary"
            >
              Total {sortBy === 'amount' && (sortDesc ? '↓' : '↑')}
            </button>
          </FinancialTableCell>
          <FinancialTableCell type="number">Paid</FinancialTableCell>
          <FinancialTableCell type="status">Status</FinancialTableCell>
        </div>

        {/* Table Rows */}
        {sortedBills.map((bill) => (
          <div
            key={bill.id}
            className="grid grid-cols-[100px_150px_150px_100px_100px_100px_100px_80px] gap-3 px-4 py-3 border-b border-border/50 hover:bg-primary/5 cursor-pointer transition-colors tabular-nums"
            onClick={() => onSelect?.(bill.id)}
          >
            <FinancialTableCell type="label" className="text-text-secondary">
              {format(new Date(bill.issueDate), 'dd MMM yy')}
            </FinancialTableCell>

            <FinancialTableCell type="label" className="font-mono text-sm font-semibold">
              {bill.billNumber}
            </FinancialTableCell>

            <FinancialTableCell type="label" className="text-text-secondary">
              {/* Supplier name would go here - for now using the ID */}
              {bill.supplierId}
            </FinancialTableCell>

            <FinancialTableCell type="number">
              <FinancialNumber value={bill.subtotal} format={formatCurrency} showFlash={false} />
            </FinancialTableCell>

            <FinancialTableCell type="number">
              <FinancialNumber value={bill.taxTotal} format={formatCurrency} showFlash={false} />
            </FinancialTableCell>

            <FinancialTableCell type="number" className="font-semibold">
              <FinancialNumber value={bill.total} format={formatCurrency} showFlash={false} />
            </FinancialTableCell>

            <FinancialTableCell type="number">
              <FinancialNumber
                value={bill.amountPaid}
                format={formatCurrency}
                showFlash={false}
                className="text-positive"
              />
            </FinancialTableCell>

            <FinancialTableCell
              type="status"
              className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusClass(bill.status)}`}
            >
              {getStatusLabel(bill.status)}
            </FinancialTableCell>
          </div>
        ))}

        {/* Table Footer — Totals */}
        <div className="grid grid-cols-[100px_150px_150px_100px_100px_100px_100px_80px] gap-3 px-4 py-3 bg-panel border-t-2 border-border font-semibold tabular-nums">
          <div></div>
          <div></div>
          <div className="px-2 py-2 text-sm text-left">TOTAL</div>
          <div className="px-2 py-2 text-sm text-right">
            <FinancialNumber value={totals.subtotal} format={formatCurrency} />
          </div>
          <div className="px-2 py-2 text-sm text-right">
            <FinancialNumber value={totals.tax} format={formatCurrency} />
          </div>
          <div className="px-2 py-2 text-sm text-right">
            <FinancialNumber value={totals.total} format={formatCurrency} />
          </div>
          <div className="px-2 py-2 text-sm text-right">
            <FinancialNumber value={totals.paid} format={formatCurrency} className="text-positive" />
          </div>
          <div></div>
        </div>
      </div>

      {/* Statistics */}
      <div className="bg-panel p-4 rounded-lg border border-border">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-text-muted">Payment Rate</div>
            <FinancialNumber
              value={percentPaid}
              format={(val) => `${val.toFixed(1)}%`}
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
    awaiting_payment: 'bg-warning-financial/20 text-warning-financial',
    partially_paid: 'bg-warning-financial/20 text-warning-financial',
    paid: 'bg-positive/20 text-positive',
    overdue: 'bg-negative/20 text-negative',
    void: 'bg-text-muted/20 text-text-muted',
  };
  return classes[status as keyof typeof classes] || '';
}

function getStatusLabel(status: string): string {
  const labels = {
    draft: 'Draft',
    awaiting_payment: 'Awaiting Payment',
    partially_paid: 'Partially Paid',
    paid: 'Paid',
    overdue: 'Overdue',
    void: 'Void',
  };
  return labels[status as keyof typeof labels] || status;
}
