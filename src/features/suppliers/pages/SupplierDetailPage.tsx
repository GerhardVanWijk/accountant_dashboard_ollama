import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CreditCard, Loader2, ReceiptText } from 'lucide-react';
import type { Address } from '@/types';
import { formatCurrency } from '@/utils/formatCurrency';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/shadcn/tabs';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/shadcn/empty';
import { ConfirmDialog } from '@/components/app/form';
import type { UseSuppliersResult } from '../hooks/useSuppliers';
import { StatusBadge } from '../components/StatusBadge';
import { calculateAging, billsToOpenBills } from '../utils/calculateAging';
import { calculateFinancialSummary } from '../utils/supplierFinancials';
import { useBills } from '@/features/purchases/hooks';
import { SupplierBillHistoryTable } from '../components/SupplierBillHistoryTable';

export interface SupplierDetailPageProps {
  supplierId: string;
  suppliersState: UseSuppliersResult;
  onBack: () => void;
  onEdit: () => void;
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value || '—'}</span>
    </div>
  );
}

function AddressBlock({ address, fallback = 'Not provided' }: { address?: Address; fallback?: string }) {
  if (!address) return <p className="text-sm text-muted-foreground">{fallback}</p>;
  return (
    <address className="text-sm text-muted-foreground not-italic">
      {address.line1}
      {address.line2 ? (
        <>
          <br />
          {address.line2}
        </>
      ) : null}
      <br />
      {[address.city, address.state, address.postalCode].filter(Boolean).join(', ')}
      <br />
      {address.country}
    </address>
  );
}

/**
 * Supplier Detail Hub, re-skinned onto v0's SectionCard/Tabs/FigureBlock.
 * All figures come unchanged from the real accounts-payable layer —
 * calculateFinancialSummary/calculateAging (suppliers-bee), fed real Bill
 * records via useBills(), same as the pre-v0 page did.
 */
export function SupplierDetailPage({ supplierId, suppliersState, onBack, onEdit }: SupplierDetailPageProps) {
  const { suppliers, loading, error, refetch, setOnHold, setStatus, deleteSupplier } = suppliersState;
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const navigate = useNavigate();

  const { bills } = useBills();
  const supplier = suppliers.find((s) => s.id === supplierId);
  const supplierBills = useMemo(() => bills.filter((b) => b.supplierId === supplierId), [bills, supplierId]);
  const summary = useMemo(
    () => (supplier ? calculateFinancialSummary(supplier, new Date(), supplierBills) : undefined),
    [supplier, supplierBills],
  );
  const aging = useMemo(
    () => calculateAging(supplierId, new Date(), billsToOpenBills(supplierBills)),
    [supplierId, supplierBills],
  );
  const outstandingByBillId = useMemo(
    () => new Map(billsToOpenBills(supplierBills).map((b) => [b.id, b.amount])),
    [supplierBills],
  );

  if (loading) {
    return (
      <div role="status" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        <p className="text-sm">Loading supplier…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-destructive">{error.message}</p>
        <Button variant="outline" size="sm" onClick={refetch}>
          Try again
        </Button>
      </div>
    );
  }

  if (!supplier || !summary) {
    return (
      <SectionCard>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Supplier not found</EmptyTitle>
            <EmptyDescription>This supplier may have been removed.</EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" size="sm" onClick={onBack}>
            Back to suppliers
          </Button>
        </Empty>
      </SectionCard>
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
    <>
      <PageHeader
        title={supplier.name}
        description={supplier.supplierNumber}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={onBack}>
              <ArrowLeft data-icon="inline-start" />
              Back
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/purchases/bills')}>
              <ReceiptText data-icon="inline-start" />
              View bills
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void setOnHold(supplier.id, !supplier.onHold);
              }}
            >
              {supplier.onHold ? 'Release hold' : 'Put on hold'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void setStatus(supplier.id, supplier.status === 'active' ? 'inactive' : 'active');
              }}
            >
              {supplier.status === 'active' ? 'Deactivate' : 'Activate'}
            </Button>
            <Button size="sm" onClick={onEdit}>
              Edit
            </Button>
          </>
        }
      />

      <div className="flex items-center gap-2">
        <StatusBadge status={supplier.status} onHold={supplier.onHold} />
      </div>

      {actionError && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <section aria-label="Supplier financial summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SectionCard bodyClassName="p-5">
          <FigureBlock label="Total payable" value={formatCurrency(summary.totalPayable, supplier.currency)} />
        </SectionCard>
        <SectionCard bodyClassName="p-5">
          <FigureBlock
            label="Overdue balance"
            value={formatCurrency(summary.overdueBalance, supplier.currency)}
            tone={summary.overdueBalance > 0 ? 'negative' : 'default'}
          />
        </SectionCard>
        <SectionCard bodyClassName="p-5">
          <FigureBlock label="YTD purchases" value={formatCurrency(summary.ytdPurchases, supplier.currency)} />
        </SectionCard>
        <SectionCard bodyClassName="p-5">
          <FigureBlock label="Available credit" value={formatCurrency(summary.creditBalance, supplier.currency)} />
        </SectionCard>
      </section>

      <SectionCard title="Accounts payable ageing">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <FigureBlock label="Current" value={formatCurrency(aging.current, supplier.currency)} />
          <FigureBlock label="30 days" value={formatCurrency(aging.days30, supplier.currency)} />
          <FigureBlock label="60 days" value={formatCurrency(aging.days60, supplier.currency)} />
          <FigureBlock
            label="90+ days"
            value={formatCurrency(aging.days90Plus, supplier.currency)}
            tone={aging.days90Plus > 0 ? 'negative' : 'default'}
          />
        </div>
      </SectionCard>

      <Tabs defaultValue="overview">
        <TabsList variant="line" className="w-full justify-start border-b border-border">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="history">Transaction history</TabsTrigger>
          <TabsTrigger value="remittance">Remittance &amp; statements</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SectionCard title="Contact">
              <InfoRow label="Contact person" value={supplier.contactPerson} />
              <InfoRow label="Email" value={supplier.email} />
              <InfoRow label="Phone" value={supplier.phone} />
              <InfoRow label="Category" value={supplier.category} />
            </SectionCard>
            <SectionCard title="Financial &amp; tax">
              <InfoRow label="Tax/VAT number" value={supplier.taxNumber} />
              <InfoRow label="Payment terms" value={supplier.paymentTerms} />
              <InfoRow label="Payment method" value={supplier.paymentMethod} />
              <InfoRow
                label="Settlement discount"
                value={supplier.settlementDiscountPercent != null ? `${supplier.settlementDiscountPercent}%` : undefined}
              />
              <InfoRow
                label="Credit limit"
                value={supplier.creditLimit != null ? formatCurrency(supplier.creditLimit, supplier.currency) : undefined}
              />
            </SectionCard>
            <SectionCard title="Physical address">
              <AddressBlock address={supplier.address} />
            </SectionCard>
            <SectionCard title="Remittance address">
              <AddressBlock address={supplier.remittanceAddress} fallback="Same as physical address" />
            </SectionCard>
            {supplier.bankDetails ? (
              <SectionCard title="Banking details" className="md:col-span-2">
                <InfoRow label="Bank" value={supplier.bankDetails.bankName} />
                <InfoRow label="Branch code" value={supplier.bankDetails.branchCode} />
                <InfoRow label="Account number" value={supplier.bankDetails.accountNumber} />
              </SectionCard>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          {supplierBills.length > 0 ? (
            <SectionCard bodyClassName="p-5">
              <SupplierBillHistoryTable bills={supplierBills} outstandingByBillId={outstandingByBillId} />
            </SectionCard>
          ) : (
            <SectionCard>
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ReceiptText />
                  </EmptyMedia>
                  <EmptyTitle>No transaction history yet</EmptyTitle>
                  <EmptyDescription>Bills received from this supplier will appear here once posted.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </SectionCard>
          )}
        </TabsContent>

        <TabsContent value="remittance" className="pt-4">
          <SectionCard>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CreditCard />
                </EmptyMedia>
                <EmptyTitle>No statements yet</EmptyTitle>
                <EmptyDescription>
                  Remittance advices and statements are generated from real bill/payment data.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </SectionCard>
        </TabsContent>
      </Tabs>

      <SectionCard title="Danger zone" className="border-destructive/30">
        <p className="text-sm text-muted-foreground">
          Permanently deleting a supplier is only allowed when it has no linked bills, payments, or ledger
          transactions. Otherwise, inactivate the supplier or place it on hold instead.
        </p>
        <Button variant="destructive" size="sm" className="mt-3" onClick={() => setConfirmDelete(true)}>
          Delete supplier
        </Button>
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete ${supplier.name}?`}
          description="This permanently removes the supplier record. This cannot be undone. If this supplier has any linked bills, payments, or ledger transactions, the deletion will be blocked automatically."
          confirmLabel="Delete supplier"
          destructive
          onConfirm={() => {
            setConfirmDelete(false);
            void handleDelete();
          }}
        />
      </SectionCard>
    </>
  );
}
