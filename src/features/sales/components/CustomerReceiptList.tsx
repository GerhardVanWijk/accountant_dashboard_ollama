import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { formatCurrency } from '@/utils/formatFinancial';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import type { CustomerReceipt } from '@/types';

interface CustomerReceiptListProps {
  receipts: CustomerReceipt[];
  customers: Map<string, string>;
  onSelect?: (id: string) => void;
  isLoading?: boolean;
  error?: string;
}

export const CustomerReceiptList: React.FC<CustomerReceiptListProps> = ({
  receipts,
  customers,
  onSelect,
  isLoading = false,
  error,
}) => {
  const [filterMethod, setFilterMethod] = useState<string | null>(null);

  const filtered = useMemo(
    () => (filterMethod ? receipts.filter((r) => r.method === filterMethod) : receipts),
    [receipts, filterMethod],
  );
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [filtered],
  );

  if (isLoading) {
    return <div className="p-8 text-center text-text-muted">Loading customer receipts...</div>;
  }
  if (error) {
    return <div className="p-8 text-danger">{error}</div>;
  }

  const methodOptions = ['eft', 'cash', 'card', 'cheque', 'other'];
  const totals = {
    amount: sorted.reduce((s, r) => s + r.amount, 0),
    unallocated: sorted.reduce((s, r) => s + r.unallocatedAmount, 0),
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Total Receipts</div>
          <div className="text-2xl font-semibold">{sorted.length}</div>
        </div>
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Total Received</div>
          <FinancialNumber value={totals.amount} format={formatCurrency} className="text-lg font-semibold text-positive" minWidth={100} />
        </div>
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">On Account (Unallocated)</div>
          <FinancialNumber value={totals.unallocated} format={formatCurrency} className="text-lg font-semibold" minWidth={100} />
        </div>
      </div>

      <div>
        <label className="text-sm text-text-muted block mb-1">Filter by Method</label>
        <select
          value={filterMethod || ''}
          onChange={(e) => setFilterMethod(e.target.value || null)}
          className="px-3 py-2 rounded border border-border bg-panel text-text"
        >
          <option value="">All Methods</option>
          {methodOptions.map((method) => (
            <option key={method} value={method}>
              {method.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      {sorted.length === 0 ? (
        <div className="p-8 text-center text-text-muted">No customer receipts found</div>
      ) : (
        <div className="bg-panel rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-[100px_150px_1fr_100px_100px_100px_100px] gap-3 px-4 py-3 bg-primary/10 border-b border-border font-semibold text-sm">
            <FinancialTableCell type="label">Date</FinancialTableCell>
            <FinancialTableCell type="label">Receipt #</FinancialTableCell>
            <FinancialTableCell type="label">Customer</FinancialTableCell>
            <FinancialTableCell type="label">Method</FinancialTableCell>
            <FinancialTableCell type="number">Amount</FinancialTableCell>
            <FinancialTableCell type="number">Allocated</FinancialTableCell>
            <FinancialTableCell type="number">On Account</FinancialTableCell>
          </div>

          {sorted.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[100px_150px_1fr_100px_100px_100px_100px] gap-3 px-4 py-3 border-b border-border/50 hover:bg-primary/5 cursor-pointer transition-colors"
              onClick={() => onSelect?.(r.id)}
            >
              <FinancialTableCell type="label" className="text-text-secondary">
                {format(new Date(r.date), 'dd MMM yy')}
              </FinancialTableCell>
              <FinancialTableCell type="label" className="font-mono text-sm font-semibold">
                {r.receiptNumber}
              </FinancialTableCell>
              <FinancialTableCell type="label" className="text-text-secondary">
                {customers.get(r.customerId) || 'Unknown'}
              </FinancialTableCell>
              <FinancialTableCell type="label" className="text-text-secondary uppercase text-xs">
                {r.method}
              </FinancialTableCell>
              <FinancialTableCell type="number" className="font-semibold">
                <FinancialNumber value={r.amount} format={formatCurrency} showFlash={false} className="text-positive" />
              </FinancialTableCell>
              <FinancialTableCell type="number">
                <FinancialNumber value={r.amount - r.unallocatedAmount} format={formatCurrency} showFlash={false} />
              </FinancialTableCell>
              <FinancialTableCell type="number">
                <FinancialNumber value={r.unallocatedAmount} format={formatCurrency} showFlash={false} />
              </FinancialTableCell>
            </div>
          ))}

          <div className="grid grid-cols-[100px_150px_1fr_100px_100px_100px_100px] gap-3 px-4 py-3 bg-panel border-t-2 border-border font-semibold">
            <FinancialTableCell type="label"> </FinancialTableCell>
            <FinancialTableCell type="label"> </FinancialTableCell>
            <FinancialTableCell type="label">TOTAL</FinancialTableCell>
            <FinancialTableCell type="label"> </FinancialTableCell>
            <FinancialTableCell type="number">
              <FinancialNumber value={totals.amount} format={formatCurrency} className="text-positive" />
            </FinancialTableCell>
            <FinancialTableCell type="number">
              <FinancialNumber value={totals.amount - totals.unallocated} format={formatCurrency} />
            </FinancialTableCell>
            <FinancialTableCell type="number">
              <FinancialNumber value={totals.unallocated} format={formatCurrency} />
            </FinancialTableCell>
          </div>
        </div>
      )}
    </div>
  );
};
