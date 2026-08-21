import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { formatCurrency } from '@/utils/formatFinancial';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import type { Payment } from '@/types';

interface PaymentListProps {
  payments: Payment[];
  suppliersMap?: Record<string, string>;
  isLoading?: boolean;
  error?: string;
}

/**
 * Payment Register table — mirrors BillList/PurchaseOrderList's
 * stats-cards + sortable-grid + totals-footer shape so all three Purchases
 * list views read as one consistent module.
 */
export const PaymentList: React.FC<PaymentListProps> = ({ payments, suppliersMap = {}, isLoading = false, error }) => {
  const [sortBy, setSortBy] = useState<'date' | 'number' | 'amount'>('date');
  const [sortDesc, setSortDesc] = useState(true);

  const sortedPayments = useMemo(() => {
    const sorted = [...payments];
    sorted.sort((a, b) => {
      if (sortBy === 'number') {
        const comparison = a.paymentNumber.localeCompare(b.paymentNumber);
        return sortDesc ? -comparison : comparison;
      } else if (sortBy === 'amount') {
        return sortDesc ? b.amount - a.amount : a.amount - b.amount;
      } else {
        const comparison = a.date.localeCompare(b.date);
        return sortDesc ? -comparison : comparison;
      }
    });
    return sorted;
  }, [payments, sortBy, sortDesc]);

  const totals = {
    amount: sortedPayments.reduce((sum, p) => sum + p.amount, 0),
    unallocated: sortedPayments.reduce((sum, p) => sum + p.unallocatedAmount, 0),
  };

  if (isLoading) {
    return <div className="p-8 text-center text-text-muted">Loading payments...</div>;
  }

  if (error) {
    return <div className="p-8 text-danger">{error}</div>;
  }

  if (payments.length === 0) {
    return <div className="p-8 text-center text-text-muted">No payments recorded yet</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Total Payments</div>
          <div className="text-2xl font-semibold">{sortedPayments.length}</div>
        </div>
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Total Paid</div>
          <FinancialNumber value={totals.amount} format={formatCurrency} className="text-2xl font-semibold" />
        </div>
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Unallocated (On-Account)</div>
          <FinancialNumber
            value={totals.unallocated}
            format={formatCurrency}
            className="text-2xl font-semibold"
            showFlash={false}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-panel rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[100px_150px_150px_100px_100px_100px_100px] gap-3 px-4 py-3 bg-primary/10 border-b border-border font-semibold text-sm sticky top-0 tabular-nums">
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
              Payment # {sortBy === 'number' && (sortDesc ? '↓' : '↑')}
            </button>
          </FinancialTableCell>
          <FinancialTableCell type="label">Supplier</FinancialTableCell>
          <FinancialTableCell type="label">Method</FinancialTableCell>
          <FinancialTableCell type="label">Reference</FinancialTableCell>
          <FinancialTableCell type="number">
            <button
              onClick={() => {
                if (sortBy === 'amount') setSortDesc(!sortDesc);
                else setSortBy('amount');
              }}
              className="hover:text-primary"
            >
              Amount {sortBy === 'amount' && (sortDesc ? '↓' : '↑')}
            </button>
          </FinancialTableCell>
          <FinancialTableCell type="number">Unallocated</FinancialTableCell>
        </div>

        {sortedPayments.map((payment) => (
          <div
            key={payment.id}
            className="grid grid-cols-[100px_150px_150px_100px_100px_100px_100px] gap-3 px-4 py-3 border-b border-border/50 tabular-nums"
          >
            <FinancialTableCell type="label" className="text-text-secondary">
              {format(new Date(payment.date), 'dd MMM yy')}
            </FinancialTableCell>
            <FinancialTableCell type="label" className="font-mono text-sm font-semibold">
              {payment.paymentNumber}
            </FinancialTableCell>
            <FinancialTableCell type="label" className="text-text-secondary">
              {suppliersMap[payment.supplierId] || payment.supplierId}
            </FinancialTableCell>
            <FinancialTableCell type="label" className="text-text-secondary uppercase text-xs">
              {payment.method}
            </FinancialTableCell>
            <FinancialTableCell type="label" className="text-text-secondary">
              {payment.reference || '—'}
            </FinancialTableCell>
            <FinancialTableCell type="number" className="font-semibold">
              <FinancialNumber value={payment.amount} format={formatCurrency} showFlash={false} />
            </FinancialTableCell>
            <FinancialTableCell type="number">
              <FinancialNumber
                value={payment.unallocatedAmount}
                format={formatCurrency}
                showFlash={false}
                className={payment.unallocatedAmount > 0 ? 'text-warning-financial' : undefined}
              />
            </FinancialTableCell>
          </div>
        ))}

        {/* Totals */}
        <div className="grid grid-cols-[100px_150px_150px_100px_100px_100px_100px] gap-3 px-4 py-3 bg-panel border-t-2 border-border font-semibold tabular-nums">
          <div></div>
          <div></div>
          <div className="px-2 py-2 text-sm text-left">TOTAL</div>
          <div></div>
          <div></div>
          <div className="px-2 py-2 text-sm text-right">
            <FinancialNumber value={totals.amount} format={formatCurrency} />
          </div>
          <div className="px-2 py-2 text-sm text-right">
            <FinancialNumber value={totals.unallocated} format={formatCurrency} showFlash={false} />
          </div>
        </div>
      </div>
    </div>
  );
};
