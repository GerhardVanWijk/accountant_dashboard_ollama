import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { formatCurrency } from '@/utils/formatFinancial';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import type { CreditNote } from '@/types';

interface CreditNoteListProps {
  creditNotes: CreditNote[];
  customers: Map<string, string>;
  onSelect?: (id: string) => void;
  isLoading?: boolean;
  error?: string;
}

export const CreditNoteList: React.FC<CreditNoteListProps> = ({
  creditNotes,
  customers,
  onSelect,
  isLoading = false,
  error,
}) => {
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  const filtered = useMemo(
    () => (filterStatus ? creditNotes.filter((cn) => cn.status === filterStatus) : creditNotes),
    [creditNotes, filterStatus],
  );
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime()),
    [filtered],
  );

  if (isLoading) {
    return <div className="p-8 text-center text-text-muted">Loading credit notes...</div>;
  }
  if (error) {
    return <div className="p-8 text-danger">{error}</div>;
  }

  const statusOptions = ['draft', 'issued', 'allocated', 'void'];
  const totals = {
    total: sorted.reduce((s, cn) => s + cn.total, 0),
    allocated: sorted.reduce((s, cn) => s + cn.amountAllocated, 0),
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Total Credit Notes</div>
          <div className="text-2xl font-semibold">{sorted.length}</div>
        </div>
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Total Value</div>
          <FinancialNumber value={totals.total} format={formatCurrency} className="text-lg font-semibold" isInverted minWidth={100} />
        </div>
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Allocated</div>
          <FinancialNumber value={totals.allocated} format={formatCurrency} className="text-lg font-semibold" isInverted minWidth={100} />
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
        <div className="p-8 text-center text-text-muted">No credit notes found</div>
      ) : (
        <div className="bg-panel rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-[100px_150px_1fr_100px_100px_100px_110px] gap-3 px-4 py-3 bg-primary/10 border-b border-border font-semibold text-sm">
            <FinancialTableCell type="label">Date</FinancialTableCell>
            <FinancialTableCell type="label">Credit Note #</FinancialTableCell>
            <FinancialTableCell type="label">Customer</FinancialTableCell>
            <FinancialTableCell type="number">Total</FinancialTableCell>
            <FinancialTableCell type="number">Allocated</FinancialTableCell>
            <FinancialTableCell type="number">Remaining</FinancialTableCell>
            <FinancialTableCell type="status">Status</FinancialTableCell>
          </div>

          {sorted.map((cn) => (
            <div
              key={cn.id}
              className="grid grid-cols-[100px_150px_1fr_100px_100px_100px_110px] gap-3 px-4 py-3 border-b border-border/50 hover:bg-primary/5 cursor-pointer transition-colors"
              onClick={() => onSelect?.(cn.id)}
            >
              <FinancialTableCell type="label" className="text-text-secondary">
                {format(new Date(cn.issueDate), 'dd MMM yy')}
              </FinancialTableCell>
              <FinancialTableCell type="label" className="font-mono text-sm font-semibold">
                {cn.creditNoteNumber}
              </FinancialTableCell>
              <FinancialTableCell type="label" className="text-text-secondary">
                {customers.get(cn.customerId) || 'Unknown'}
              </FinancialTableCell>
              <FinancialTableCell type="number" className="font-semibold">
                <FinancialNumber value={cn.total} format={formatCurrency} showFlash={false} isInverted />
              </FinancialTableCell>
              <FinancialTableCell type="number">
                <FinancialNumber value={cn.amountAllocated} format={formatCurrency} showFlash={false} isInverted />
              </FinancialTableCell>
              <FinancialTableCell type="number">
                <FinancialNumber value={cn.total - cn.amountAllocated} format={formatCurrency} showFlash={false} isInverted />
              </FinancialTableCell>
              <FinancialTableCell type="status" className={getStatusClass(cn.status)}>
                {getStatusLabel(cn.status)}
              </FinancialTableCell>
            </div>
          ))}

          <div className="grid grid-cols-[100px_150px_1fr_100px_100px_100px_110px] gap-3 px-4 py-3 bg-panel border-t-2 border-border font-semibold">
            <FinancialTableCell type="label"> </FinancialTableCell>
            <FinancialTableCell type="label"> </FinancialTableCell>
            <FinancialTableCell type="label">TOTAL</FinancialTableCell>
            <FinancialTableCell type="number">
              <FinancialNumber value={totals.total} format={formatCurrency} isInverted />
            </FinancialTableCell>
            <FinancialTableCell type="number">
              <FinancialNumber value={totals.allocated} format={formatCurrency} isInverted />
            </FinancialTableCell>
            <FinancialTableCell type="number">
              <FinancialNumber value={totals.total - totals.allocated} format={formatCurrency} isInverted />
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
    issued: 'bg-warning-financial/20 text-warning-financial',
    allocated: 'bg-positive/20 text-positive',
    void: 'bg-text-muted/20 text-text-muted',
  };
  return classes[status] || '';
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: 'Draft',
    issued: 'Issued',
    allocated: 'Allocated',
    void: 'Void',
  };
  return labels[status] || status;
}
