import { useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/shadcn/dialog';
import { formatCurrency } from '@/lib/app/format';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { usePayments, usePaymentMutations, useBills } from '../hooks';
import { PaymentList } from '../components/PaymentList';
import { PaymentForm } from '../components/PaymentForm';
import { nextDocumentNumber } from '../utils/nextDocumentNumber';
import type { CreatePaymentDTO } from '../services';

/**
 * Supplier Payments (Accounts Payable) — route `/purchases/payments`.
 * Real usePayments()/PaymentService data. Deliberately the AP-only real
 * `Payment`/`PaymentRepository` domain, distinct from Customer Receipts
 * (AR) — not merged into one generic "payments" concept just because v0's
 * own mock did (M4's finding, reaffirmed here). No detail route: a posted
 * Payment has no further status transitions to drill into, unlike a Bill
 * or Purchase Order. Re-skinned onto v0's PageHeader/SectionCard/Dialog
 * (M8); allocation/GL-posting wiring unchanged.
 */
export function PaymentsPage() {
  const { payments, isLoading, error, refetch } = usePayments();
  const { bills, refetch: refetchBills } = useBills();
  const { suppliers } = useSuppliers();
  const { createPayment, isLoading: isSubmittingPayment } = usePaymentMutations();

  const [showCreate, setShowCreate] = useState(false);

  const suppliersMap = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const outstandingBills = useMemo(() => bills.filter((bill) => bill.status !== 'void' && bill.total > bill.amountPaid), [bills]);

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalUnallocated = payments.reduce((sum, p) => sum + p.unallocatedAmount, 0);

  async function handleCreate(data: CreatePaymentDTO) {
    await createPayment(data);
    await Promise.all([refetch(), refetchBills()]);
    setShowCreate(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Supplier Payments"
        description="Money paid to suppliers, allocated against open bills."
        actions={
          <Button size="sm" disabled={isSubmittingPayment} onClick={() => setShowCreate(true)}>
            <Plus data-icon="inline-start" />
            Record payment
          </Button>
        }
      />

      <SectionCard>
        <div className="grid gap-6 sm:grid-cols-3">
          <FigureBlock label="Total paid" value={formatCurrency(totalPaid)} hint={`${payments.length} payments`} tone="positive" />
          <FigureBlock label="Unallocated (on-account)" value={formatCurrency(totalUnallocated)} tone={totalUnallocated > 0 ? 'warning' : 'default'} />
          <FigureBlock label="Suppliers paid" value={String(new Set(payments.map((p) => p.supplierId)).size)} />
        </div>
      </SectionCard>

      {isLoading && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading payments…</p>
        </div>
      )}
      {!isLoading && error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error.message}
        </div>
      )}
      {!isLoading && !error && <PaymentList payments={payments} suppliersMap={suppliersMap} />}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <PaymentForm
            suppliers={suppliers}
            outstandingBills={outstandingBills}
            defaultPaymentNumber={nextDocumentNumber(payments.map((p) => p.paymentNumber), 'PAY')}
            onSubmit={handleCreate}
            onCancel={() => setShowCreate(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
