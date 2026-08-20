import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Address, CurrencyCode } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { formatCurrency } from '@/utils/formatCurrency';
import { cn } from '@/utils/cn';
import type { UseSuppliersResult } from '../hooks/useSuppliers';
import { StatusBadge } from '../components/StatusBadge';
import { calculateAging } from '../utils/calculateAging';
import { calculateFinancialSummary } from '../utils/supplierFinancials';

export interface SupplierDetailPageProps {
  supplierId: string;
  suppliersState: UseSuppliersResult;
  onBack: () => void;
  onEdit: () => void;
}

type DetailTab = 'overview' | 'history' | 'remittance';

/**
 * Supplier Detail Hub: financial summary cards, aging breakdown,
 * contact/address/banking overview, Transaction History (empty — no
 * real PO/bill data yet) and Remittance & Statements (date-range stub,
 * export disabled rather than faked).
 */
export function SupplierDetailPage({ supplierId, suppliersState, onBack, onEdit }: SupplierDetailPageProps) {
  const { suppliers, loading, error, refetch, setOnHold, setStatus, deleteSupplier } = suppliersState;
  const [tab, setTab] = useState<DetailTab>('overview');
  const [actionError, setActionError] = useState<string | null>(null);
  const navigate = useNavigate();

  const supplier = suppliers.find((s) => s.id === supplierId);
  const summary = useMemo(() => (supplier ? calculateFinancialSummary(supplier) : undefined), [supplier]);
  const aging = useMemo(() => calculateAging(supplierId), [supplierId]);

  if (loading) return <Spinner label="Loading supplier…" />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (!supplier || !summary) {
    return (
      <EmptyState
        title="Supplier not found"
        message="This supplier may have been removed."
        action={
          <Button variant="ghost" onClick={onBack}>
            Back to Suppliers
          </Button>
        }
      />
    );
  }

  async function handleDelete() {
    setActionError(null);
    try {
      await deleteSupplier(supplier!.id);
      onBack();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete supplier.');
    }
  }

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <Button variant="ghost" className="px-0 py-0 text-xs" onClick={onBack}>
            <Icon name="chevronDown" size={14} className="rotate-90" />
            Back to Suppliers
          </Button>
          <div className="mt-xs flex flex-wrap items-center gap-sm">
            <h1 className="text-2xl font-semibold text-text-primary">{supplier.name}</h1>
            <StatusBadge status={supplier.status} onHold={supplier.onHold} />
          </div>
          <p className="text-sm text-text-secondary">{supplier.supplierNumber}</p>
        </div>
        <div className="flex flex-wrap gap-sm">
          <Button variant="ghost" onClick={() => navigate('/purchases/bills')}>
            <Icon name="bills" size={16} />
            View Bills
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void setOnHold(supplier.id, !supplier.onHold);
            }}
          >
            {supplier.onHold ? 'Release Hold' : 'Put On Hold'}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void setStatus(supplier.id, supplier.status === 'active' ? 'inactive' : 'active');
            }}
          >
            {supplier.status === 'active' ? 'Deactivate' : 'Activate'}
          </Button>
          <Button variant="primary" onClick={onEdit}>
            Edit
          </Button>
        </div>
      </div>

      {actionError && <ErrorState title="Action failed" message={actionError} />}

      <div className="grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Total Payable" value={formatCurrency(summary.totalPayable, supplier.currency)} />
        <SummaryCard
          label="Overdue Balance"
          value={formatCurrency(summary.overdueBalance, supplier.currency)}
          tone={summary.overdueBalance > 0 ? 'danger' : undefined}
        />
        <SummaryCard label="YTD Purchases" value={formatCurrency(summary.ytdPurchases, supplier.currency)} />
        <SummaryCard label="Available Credit" value={formatCurrency(summary.creditBalance, supplier.currency)} />
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-text-primary">Accounts Payable Aging</h2>
        <div className="mt-md grid grid-cols-2 gap-md sm:grid-cols-4">
          <AgingCell label="Current" value={aging.current} currency={supplier.currency} />
          <AgingCell label="30 Days" value={aging.days30} currency={supplier.currency} />
          <AgingCell label="60 Days" value={aging.days60} currency={supplier.currency} />
          <AgingCell label="90+ Days" value={aging.days90Plus} currency={supplier.currency} tone="danger" />
        </div>
      </Card>

      <div className="flex flex-wrap gap-xs border-b border-border" role="tablist">
        <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>
          Overview
        </TabButton>
        <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
          Transaction History
        </TabButton>
        <TabButton active={tab === 'remittance'} onClick={() => setTab('remittance')}>
          Remittance & Statements
        </TabButton>
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-md md:grid-cols-2">
          <Card>
            <h3 className="text-sm font-semibold text-text-primary">Contact</h3>
            <dl className="mt-sm flex flex-col gap-xs text-sm text-text-secondary">
              <Row label="Contact Person" value={supplier.contactPerson} />
              <Row label="Email" value={supplier.email} />
              <Row label="Phone" value={supplier.phone} />
              <Row label="Category" value={supplier.category} />
            </dl>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-text-primary">Financial & Tax</h3>
            <dl className="mt-sm flex flex-col gap-xs text-sm text-text-secondary">
              <Row label="Tax / VAT Number" value={supplier.taxNumber} />
              <Row label="Payment Terms" value={supplier.paymentTerms} />
              <Row label="Payment Method" value={supplier.paymentMethod} />
              <Row
                label="Settlement Discount"
                value={supplier.settlementDiscountPercent != null ? `${supplier.settlementDiscountPercent}%` : undefined}
              />
              <Row
                label="Credit Limit"
                value={supplier.creditLimit != null ? formatCurrency(supplier.creditLimit, supplier.currency) : undefined}
              />
            </dl>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-text-primary">Physical Address</h3>
            <AddressBlock address={supplier.address} />
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-text-primary">Remittance Address</h3>
            <AddressBlock address={supplier.remittanceAddress} fallback="Same as physical address" />
          </Card>
          {supplier.bankDetails && (
            <Card className="md:col-span-2">
              <h3 className="text-sm font-semibold text-text-primary">Banking Details</h3>
              <dl className="mt-sm flex flex-col gap-xs text-sm text-text-secondary">
                <Row label="Bank" value={supplier.bankDetails.bankName} />
                <Row label="Branch Code" value={supplier.bankDetails.branchCode} />
                <Row label="Account Number" value={supplier.bankDetails.accountNumber} />
              </dl>
            </Card>
          )}
        </div>
      )}

      {tab === 'history' && (
        <EmptyState
          title="No transaction history yet"
          message="Purchase orders, bills, supplier credits, payments, and journal entries will appear here once the Purchases module ships real data."
        />
      )}

      {tab === 'remittance' && (
        <Card className="flex flex-col gap-md">
          <h3 className="text-sm font-semibold text-text-primary">Remittance & Statements</h3>
          <div className="flex flex-wrap items-end gap-md">
            <label className="flex flex-col gap-xs text-sm">
              <span className="text-text-secondary">From</span>
              <input
                type="date"
                className="rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary"
              />
            </label>
            <label className="flex flex-col gap-xs text-sm">
              <span className="text-text-secondary">To</span>
              <input
                type="date"
                className="rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary"
              />
            </label>
            <Button
              variant="ghost"
              disabled
              title="PDF export ships once the Purchases module provides real statement data"
            >
              Export PDF (Coming Soon)
            </Button>
          </div>
          <EmptyState
            title="No statements yet"
            message="Remittance advices and statements are generated from real bill/payment data, which isn't available until the Purchases module ships."
          />
        </Card>
      )}

      <Card className="border-danger">
        <h3 className="text-sm font-semibold text-text-primary">Danger Zone</h3>
        <p className="mt-xs text-sm text-text-secondary">
          Permanently deleting a supplier is only allowed when it has no linked bills, payments, or ledger
          transactions. Otherwise, inactivate the supplier or place it on hold instead.
        </p>
        <Button variant="danger" className="mt-sm" onClick={handleDelete}>
          Delete Supplier
        </Button>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">{label}</p>
      <p className={cn('mt-xs text-xl font-semibold', tone === 'danger' ? 'text-danger' : 'text-text-primary')}>
        {value}
      </p>
    </Card>
  );
}

function AgingCell({
  label,
  value,
  currency,
  tone,
}: {
  label: string;
  value: number;
  currency: CurrencyCode;
  tone?: 'danger';
}) {
  return (
    <div className="flex flex-col gap-xs rounded-md border border-border p-sm">
      <span className="text-xs text-text-secondary">{label}</span>
      <span className={cn('text-sm font-semibold', tone && value > 0 ? 'text-danger' : 'text-text-primary')}>
        {formatCurrency(value, currency)}
      </span>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'rounded-t-md px-md py-sm text-sm font-medium transition-colors',
        active ? 'border-b-2 border-primary text-text-primary' : 'text-text-secondary hover:text-text-primary',
      )}
    >
      {children}
    </button>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-md">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="text-right text-text-primary">{value || '—'}</dd>
    </div>
  );
}

function AddressBlock({ address, fallback = 'Not provided' }: { address?: Address; fallback?: string }) {
  if (!address) {
    return <p className="mt-sm text-sm text-text-secondary">{fallback}</p>;
  }
  return (
    <address className="mt-sm not-italic text-sm text-text-secondary">
      {address.line1}
      {address.line2 && (
        <>
          <br />
          {address.line2}
        </>
      )}
      <br />
      {[address.city, address.state, address.postalCode].filter(Boolean).join(', ')}
      <br />
      {address.country}
    </address>
  );
}
