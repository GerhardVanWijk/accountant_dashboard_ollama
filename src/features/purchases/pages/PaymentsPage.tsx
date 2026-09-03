import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { useLegacyRecordRedirect } from '@/components/app/record-page';
import { formatCurrency } from '@/lib/app/format';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { usePayments, usePaymentMutations, useBills } from '../hooks';
import { PaymentList } from '../components/PaymentList';
import { PaymentFormModal } from '../components/PaymentFormModal';
import { nextDocumentNumber } from '../utils/nextDocumentNumber';
import type { CreatePaymentDTO } from '../services';

/**
 * Supplier Payments (Accounts Payable) — route `/purchases/payments`, the
 * list only. A row click navigates to the full-page record at
 * `/purchases/payments/:paymentId` (SupplierPaymentDetailPage); legacy
 * `?record=<id>` deep links are redirected there.
 */
export function PaymentsPage() {
  const navigate = useNavigate();
  useLegacyRecordRedirect('/purchases/payments');

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
    <>
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

        {isLoading ? (
          <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            <p className="text-sm">Loading payments…</p>
          </div>
        ) : error ? (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error.message}
          </div>
        ) : (
          <PaymentList payments={payments} suppliersMap={suppliersMap} onSelect={(id) => navigate(`/purchases/payments/${id}`)} />
        )}
      </div>

      {showCreate && (
        <PaymentFormModal
          suppliers={suppliers}
          outstandingBills={outstandingBills}
          defaultPaymentNumber={nextDocumentNumber(payments.map((p) => p.paymentNumber), 'PAY')}
          onSubmit={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}
    </>
  );
}
