import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { formatCurrency } from '@/utils/formatFinancial';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import type { Quote } from '@/types';

interface QuoteListProps {
  quotes: Quote[];
  customers: Map<string, string>;
  onSelect?: (id: string) => void;
  isLoading?: boolean;
  error?: string;
}

export const QuoteList: React.FC<QuoteListProps> = ({ quotes, customers, onSelect, isLoading = false, error }) => {
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  const filtered = useMemo(
    () => (filterStatus ? quotes.filter((q) => q.status === filterStatus) : quotes),
    [quotes, filterStatus],
  );
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime()),
    [filtered],
  );

  if (isLoading) {
    return <div className="p-8 text-center text-text-muted">Loading quotes...</div>;
  }
  if (error) {
    return <div className="p-8 text-danger">{error}</div>;
  }

  const statusOptions = ['draft', 'sent', 'accepted', 'declined', 'expired'];
  const totals = {
    subtotal: sorted.reduce((s, q) => s + q.subtotal, 0),
    tax: sorted.reduce((s, q) => s + q.taxTotal, 0),
    total: sorted.reduce((s, q) => s + q.total, 0),
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Total Quotes</div>
          <div className="text-2xl font-semibold">{sorted.length}</div>
        </div>
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Total Value</div>
          <FinancialNumber value={totals.total} format={formatCurrency} className="text-lg font-semibold" minWidth={100} />
        </div>
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Accepted</div>
          <div className="text-2xl font-semibold text-positive">
            {sorted.filter((q) => q.status === 'accepted').length}
          </div>
        </div>
      </div>

      <div>
        <label className="text-sm text-text-muted block mb-1">Filter by Status</label>
        <select
          value={filterStatus || ''}
          onChange={(e) => setFilterStatus(e.target.value || null)}
          className="px-3 py-2 rounded border border-border bg-panel text-text"
        >
          <option value="">All Statuses</option>
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {status.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      {sorted.length === 0 ? (
        <div className="p-8 text-center text-text-muted">No quotes found</div>
      ) : (
        <div className="bg-panel rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-[100px_150px_1fr_100px_100px_100px_110px] gap-3 px-4 py-3 bg-primary/10 border-b border-border font-semibold text-sm">
            <FinancialTableCell type="label">Date</FinancialTableCell>
            <FinancialTableCell type="label">Quote #</FinancialTableCell>
            <FinancialTableCell type="label">Customer</FinancialTableCell>
            <FinancialTableCell type="number">Subtotal</FinancialTableCell>
            <FinancialTableCell type="number">Tax</FinancialTableCell>
            <FinancialTableCell type="number">Total</FinancialTableCell>
            <FinancialTableCell type="status">Status</FinancialTableCell>
          </div>

          {sorted.map((quote) => (
            <div
              key={quote.id}
              className="grid grid-cols-[100px_150px_1fr_100px_100px_100px_110px] gap-3 px-4 py-3 border-b border-border/50 hover:bg-primary/5 cursor-pointer transition-colors"
              onClick={() => onSelect?.(quote.id)}
            >
              <FinancialTableCell type="label" className="text-text-secondary">
                {format(new Date(quote.issueDate), 'dd MMM yy')}
              </FinancialTableCell>
              <FinancialTableCell type="label" className="font-mono text-sm font-semibold">
                {quote.quoteNumber}
              </FinancialTableCell>
              <FinancialTableCell type="label" className="text-text-secondary">
                {customers.get(quote.customerId) || 'Unknown'}
              </FinancialTableCell>
              <FinancialTableCell type="number">
                <FinancialNumber value={quote.subtotal} format={formatCurrency} showFlash={false} />
              </FinancialTableCell>
              <FinancialTableCell type="number">
                <FinancialNumber value={quote.taxTotal} format={formatCurrency} showFlash={false} />
              </FinancialTableCell>
              <FinancialTableCell type="number" className="font-semibold">
                <FinancialNumber value={quote.total} format={formatCurrency} showFlash={false} />
              </FinancialTableCell>
              <FinancialTableCell type="status" className={getStatusClass(quote.status)}>
                {getStatusLabel(quote.status)}
              </FinancialTableCell>
            </div>
          ))}

          <div className="grid grid-cols-[100px_150px_1fr_100px_100px_100px_110px] gap-3 px-4 py-3 bg-panel border-t-2 border-border font-semibold">
            <FinancialTableCell type="label"> </FinancialTableCell>
            <FinancialTableCell type="label"> </FinancialTableCell>
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
            <FinancialTableCell type="status"> </FinancialTableCell>
          </div>
        </div>
      )}
    </div>
  );
};

function getStatusClass(status: string): string {
  const classes: Record<string, string> = {
    draft: 'bg-info-financial/20 text-info-financial',
    sent: 'bg-warning-financial/20 text-warning-financial',
    accepted: 'bg-positive/20 text-positive',
    declined: 'bg-negative/20 text-negative',
    expired: 'bg-text-muted/20 text-text-muted',
  };
  return classes[status] || '';
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: 'Draft',
    sent: 'Sent',
    accepted: 'Accepted',
    declined: 'Declined',
    expired: 'Expired',
  };
  return labels[status] || status;
}
