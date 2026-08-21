import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { formatCurrency } from '@/utils/formatFinancial';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import type { PurchaseOrder } from '@/types';

interface PurchaseOrderListProps {
  purchaseOrders: PurchaseOrder[];
  onSelect?: (id: string) => void;
  isLoading?: boolean;
  error?: string;
}

export const PurchaseOrderList: React.FC<PurchaseOrderListProps> = ({
  purchaseOrders,
  onSelect,
  isLoading = false,
  error,
}) => {
  const [sortBy, setSortBy] = useState<'date' | 'number' | 'amount'>('date');
  const [sortDesc, setSortDesc] = useState(true);

  // Sort purchase orders (must be before any early returns due to React Hooks rules)
  const sortedOrders = useMemo(() => {
    const sorted = [...purchaseOrders];
    sorted.sort((a, b) => {
      if (sortBy === 'number') {
        const comparison = a.poNumber.localeCompare(b.poNumber);
        return sortDesc ? -comparison : comparison;
      } else if (sortBy === 'amount') {
        return sortDesc ? b.total - a.total : a.total - b.total;
      } else {
        // Default to date
        const comparison = a.orderDate.localeCompare(b.orderDate);
        return sortDesc ? -comparison : comparison;
      }
    });
    return sorted;
  }, [purchaseOrders, sortBy, sortDesc]);

  // Calculate totals for footer
  const totals = {
    subtotal: sortedOrders.reduce((sum, po) => sum + po.subtotal, 0),
    tax: sortedOrders.reduce((sum, po) => sum + po.taxTotal, 0),
    total: sortedOrders.reduce((sum, po) => sum + po.total, 0),
  };

  if (isLoading) {
    return <div className="p-8 text-center text-text-muted">Loading purchase orders...</div>;
  }

  if (error) {
    return <div className="p-8 text-danger">{error}</div>;
  }

  if (purchaseOrders.length === 0) {
    return <div className="p-8 text-center text-text-muted">No purchase orders yet</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Total Orders</div>
          <div className="text-2xl font-semibold">{sortedOrders.length}</div>
        </div>
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Total Value</div>
          <FinancialNumber
            value={totals.total}
            format={formatCurrency}
            className="text-2xl font-semibold"
          />
        </div>
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Pending Orders</div>
          <div className="text-2xl font-semibold">
            {sortedOrders.filter((po) => po.status !== 'received' && po.status !== 'cancelled').length}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-panel rounded-lg border border-border overflow-hidden">
        {/* Table Header */}
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
              PO # {sortBy === 'number' && (sortDesc ? '↓' : '↑')}
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
          <FinancialTableCell type="status">Status</FinancialTableCell>
        </div>

        {/* Table Rows */}
        {sortedOrders.map((po) => (
          <div
            key={po.id}
            className="grid grid-cols-[100px_150px_150px_100px_100px_100px_100px] gap-3 px-4 py-3 border-b border-border/50 hover:bg-primary/5 cursor-pointer transition-colors tabular-nums"
            onClick={() => onSelect?.(po.id)}
          >
            <FinancialTableCell type="label" className="text-text-secondary">
              {format(new Date(po.orderDate), 'dd MMM yy')}
            </FinancialTableCell>

            <FinancialTableCell type="label" className="font-mono text-sm font-semibold">
              {po.poNumber}
            </FinancialTableCell>

            <FinancialTableCell type="label" className="text-text-secondary">
              {po.supplierId}
            </FinancialTableCell>

            <FinancialTableCell type="number">
              <FinancialNumber value={po.subtotal} format={formatCurrency} showFlash={false} />
            </FinancialTableCell>

            <FinancialTableCell type="number">
              <FinancialNumber value={po.taxTotal} format={formatCurrency} showFlash={false} />
            </FinancialTableCell>

            <FinancialTableCell type="number" className="font-semibold">
              <FinancialNumber value={po.total} format={formatCurrency} showFlash={false} />
            </FinancialTableCell>

            <FinancialTableCell
              type="status"
              className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusClass(po.status)}`}
            >
              {getStatusLabel(po.status)}
            </FinancialTableCell>
          </div>
        ))}

        {/* Table Footer — Totals */}
        <div className="grid grid-cols-[100px_150px_150px_100px_100px_100px_100px] gap-3 px-4 py-3 bg-panel border-t-2 border-border font-semibold tabular-nums">
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
          <div></div>
        </div>
      </div>
    </div>
  );
};

function getStatusClass(status: string): string {
  const classes = {
    draft: 'bg-info-financial/20 text-info-financial',
    sent: 'bg-warning-financial/20 text-warning-financial',
    partially_received: 'bg-warning-financial/20 text-warning-financial',
    received: 'bg-positive/20 text-positive',
    cancelled: 'bg-text-muted/20 text-text-muted',
  };
  return classes[status as keyof typeof classes] || '';
}

function getStatusLabel(status: string): string {
  const labels = {
    draft: 'Draft',
    sent: 'Sent',
    partially_received: 'Partially Received',
    received: 'Received',
    cancelled: 'Cancelled',
  };
  return labels[status as keyof typeof labels] || status;
}
