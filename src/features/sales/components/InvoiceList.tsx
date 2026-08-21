import React, { useState } from 'react';
import { formatCurrency, formatPercentage } from '@/utils/formatFinancial';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import { format } from 'date-fns';
import type { Invoice } from '@/types';

interface InvoiceListProps {
  invoices: Invoice[];
  customers: Map<string, string>; // customerId -> customerName
  onSelect?: (id: string) => void;
  isLoading?: boolean;
  error?: string;
}

export const InvoiceList: React.FC<InvoiceListProps> = ({
  invoices,
  customers,
  onSelect,
  isLoading = false,
  error,
}) => {
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'customer'>('date');
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  if (isLoading) {
    return <div className="p-8 text-center text-text-muted">Loading invoices...</div>;
  }

  if (error) {
    return <div className="p-8 text-danger">{error}</div>;
  }

  // Filter by status if selected
  let filtered = invoices;
  if (filterStatus) {
    filtered = invoices.filter((inv) => inv.status === filterStatus);
  }

  // Sort invoices
  const sorted =
    sortBy === 'date'
      ? [...filtered].sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime())
      : sortBy === 'amount'
        ? [...filtered].sort((a, b) => b.total - a.total)
        : [...filtered].sort((a, b) => {
            const nameA = customers.get(a.customerId) || 'Unknown';
            const nameB = customers.get(b.customerId) || 'Unknown';
            return nameA.localeCompare(nameB);
          });

  if (sorted.length === 0) {
    return <div className="p-8 text-center text-text-muted">No invoices found</div>;
  }

  // Calculate totals
  const totals = {
    subtotal: sorted.reduce((sum, inv) => sum + inv.subtotal, 0),
    tax: sorted.reduce((sum, inv) => sum + inv.taxTotal, 0),
    total: sorted.reduce((sum, inv) => sum + inv.total, 0),
    paid: sorted.reduce((sum, inv) => sum + inv.amountPaid, 0),
    outstanding: sorted.reduce((sum, inv) => sum + (inv.total - inv.amountPaid), 0),
  };

  const percentPaid = totals.total > 0 ? (totals.paid / totals.total) * 100 : 0;

  const statusOptions = ['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'void'];

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Total Invoices</div>
          <div className="text-2xl font-semibold">{sorted.length}</div>
        </div>
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Total Amount</div>
          <FinancialNumber
            value={totals.total}
            format={formatCurrency}
            className="text-lg font-semibold"
            minWidth={100}
          />
        </div>
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Amount Paid</div>
          <FinancialNumber
            value={totals.paid}
            format={formatCurrency}
            className="text-lg font-semibold text-positive"
            minWidth={100}
          />
        </div>
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Outstanding</div>
          <FinancialNumber
            value={totals.outstanding}
            format={formatCurrency}
            className="text-lg font-semibold text-negative"
            minWidth={100}
          />
        </div>
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Collection Rate</div>
          <FinancialNumber
            value={percentPaid}
            format={formatPercentage}
            className="text-lg font-semibold"
            minWidth={80}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-4 mb-4">
        <div>
          <label className="text-sm text-text-muted block mb-1">Sort By</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'date' | 'amount' | 'customer')}
            className="px-3 py-2 rounded border border-border bg-panel text-text"
          >
            <option value="date">Date</option>
            <option value="amount">Amount</option>
            <option value="customer">Customer</option>
          </select>
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
      </div>

      {/* Table */}
      <div className="bg-panel rounded-lg border border-border overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-[100px_150px_150px_100px_100px_100px_100px_100px] gap-3 px-4 py-3 bg-primary/10 border-b border-border font-semibold text-sm sticky top-0">
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
        {sorted.map((invoice) => (
          <div
            key={invoice.id}
            className="grid grid-cols-[100px_150px_150px_100px_100px_100px_100px_100px] gap-3 px-4 py-3 border-b border-border/50 hover:bg-primary/5 cursor-pointer transition-colors"
            onClick={() => onSelect?.(invoice.id)}
          >
            <FinancialTableCell type="label" className="text-text-secondary">
              {format(new Date(invoice.issueDate), 'dd MMM yy')}
            </FinancialTableCell>

            <FinancialTableCell type="label" className="font-mono text-sm font-semibold">
              {invoice.invoiceNumber}
            </FinancialTableCell>

            <FinancialTableCell type="label" className="text-text-secondary">
              {customers.get(invoice.customerId) || 'Unknown'}
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
                value={invoice.taxTotal}
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
                value={invoice.amountPaid}
                format={formatCurrency}
                showFlash={false}
                className="text-positive"
              />
            </FinancialTableCell>

            <FinancialTableCell type="status" className={getStatusClass(invoice.status)}>
              {getStatusLabel(invoice.status)}
            </FinancialTableCell>
          </div>
        ))}

        {/* Table Footer — Totals */}
        <div className="grid grid-cols-[100px_150px_150px_100px_100px_100px_100px_100px] gap-3 px-4 py-3 bg-panel border-t-2 border-border font-semibold">
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
          <FinancialTableCell type="number">
            <FinancialNumber value={totals.paid} format={formatCurrency} className="text-positive" />
          </FinancialTableCell>
          <FinancialTableCell type="status"> </FinancialTableCell>
        </div>
      </div>
    </div>
  );
};

function getStatusClass(status: string): string {
  const classes: Record<string, string> = {
    draft: 'bg-info-financial/20 text-info-financial',
    sent: 'bg-warning-financial/20 text-warning-financial',
    paid: 'bg-positive/20 text-positive',
    partially_paid: 'bg-warning-financial/20 text-warning-financial',
    overdue: 'bg-negative/20 text-negative',
    void: 'bg-text-muted/20 text-text-muted',
  };
  return classes[status] || '';
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: 'Draft',
    sent: 'Sent',
    paid: 'Paid',
    partially_paid: 'Partial',
    overdue: 'Overdue',
    void: 'Void',
  };
  return labels[status] || status;
}
