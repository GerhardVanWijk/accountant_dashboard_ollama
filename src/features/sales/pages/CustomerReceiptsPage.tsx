import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { formatCurrency } from '@/lib/app/format';
import { CustomerReceiptList } from '@/features/sales/components/CustomerReceiptList';
import { CustomerReceiptDetail } from '@/features/sales/components/CustomerReceiptDetail';
import { CustomerReceiptFormModal } from '@/features/sales/components/CustomerReceiptFormModal';
import { AllocationFormModal, type OpenInvoiceOption } from '@/features/sales/components/AllocationFormModal';
import { useCustomerReceipts } from '@/features/sales/hooks/useCustomerReceipts';
import { useCustomerReceiptMutations } from '@/features/sales/hooks/useCustomerReceiptMutations';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useCustomerMap, useCustomerList } from '@/features/sales/hooks/useCustomerMap';
import { receiptAllocationState } from '@/features/sales/utils/receiptAllocationState';

type View = { type: 'list' } | { type: 'detail'; id: string };

/** Outstanding-balance epsilon, matching CustomerReceiptService.BALANCE_EPSILON. */
const EPSILON = 0.01;

/**
 * Route target for /sales/receipts (nav label "Payments") — real
 * useCustomerReceipts()/CustomerReceiptService data, v0 page shell,
 * list/detail views, the record-receipt intake form (with initial
 * allocations), and the "apply on-account balance" follow-up allocation,
 * all in-page-state. AR-only: v0's own "Payments" mock mixes customer
 * receipts with supplier payments (the AP side, a different domain
 * entirely — Payment/PaymentRepository) — out of M4 scope, see the report.
 */
export function CustomerReceiptsPage() {
  const [view, setView] = useState<View>({ type: 'list' });
  const [showForm, setShowForm] = useState(false);
  const [showAllocate, setShowAllocate] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { receipts, isLoading, error, refetch } = useCustomerReceipts();
  const detailReceipt = view.type === 'detail' ? receipts.find((r) => r.id === view.id) : undefined;
  const { customers: customerMap } = useCustomerMap();
  const { customers: customerList } = useCustomerList();
  const { invoices, refetch: refetchInvoices } = useInvoices();
  const {
    recordReceipt,
    allocateToInvoice,
    isLoading: isMutating,
    error: mutationError,
  } = useCustomerReceiptMutations({ onSuccess: () => refetch() });

  const nextReceiptNumber = `RCT-${new Date().getFullYear()}-${String(receipts.length + 1).padStart(4, '0')}`;
  const invoiceNumbers = new Map(invoices.map((inv) => [inv.id, inv.invoiceNumber]));

  const receivedTotal = receipts.reduce((sum, r) => sum + r.amount, 0);
  const unallocated = receipts.filter((r) => receiptAllocationState(r) !== 'allocated');
  const unallocatedTotal = unallocated.reduce((sum, r) => sum + r.unallocatedAmount, 0);

  const openInvoiceOptions: OpenInvoiceOption[] = detailReceipt
    ? invoices
        .filter((inv) => inv.customerId === detailReceipt.customerId && inv.total - inv.amountPaid > EPSILON)
        .map((inv) => ({ invoice: inv, outstanding: inv.total - inv.amountPaid }))
    : [];

  async function handleCreate(data: Parameters<typeof recordReceipt>[0]) {
    await recordReceipt(data);
    await refetchInvoices();
    setShowForm(false);
    setNotice('Receipt recorded and posted to the ledger.');
  }

  async function handleAllocate(invoiceId: string, amount: number) {
    if (!detailReceipt) return;
    await allocateToInvoice(detailReceipt.id, invoiceId, amount);
    await refetchInvoices();
    setShowAllocate(false);
    setNotice('Receipt allocated to invoice.');
  }

  return (
    <>
      {view.type === 'list' && (
        <div className="flex flex-col gap-6">
          <PageHeader
            title="Payments"
            description="Money received from customers, with allocation status against open invoices."
            actions={
              <Button size="sm" onClick={() => setShowForm(true)}>
                <Plus data-icon="inline-start" />
                Record receipt
              </Button>
            }
          />

          <SectionCard>
            <div className="grid gap-6 sm:grid-cols-3">
              <FigureBlock label="Received" value={formatCurrency(receivedTotal)} hint={`${receipts.length} customer receipts`} tone="positive" />
              <FigureBlock
                label="Unallocated"
                value={formatCurrency(unallocatedTotal)}
                hint={`${unallocated.length} awaiting matching`}
                tone={unallocated.length > 0 ? 'warning' : 'default'}
              />
              <FigureBlock label="Fully allocated" value={String(receipts.length - unallocated.length)} hint="Matched to invoices" />
            </div>
          </SectionCard>

          {notice && (
            <p className="rounded-lg border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive">{notice}</p>
          )}
          {mutationError && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {mutationError.message}
            </p>
          )}

          {isLoading && (
            <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              <p className="text-sm">Loading customer receipts…</p>
            </div>
          )}
          {!isLoading && error && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error.message}
            </div>
          )}
          {!isLoading && !error && (
            <CustomerReceiptList
              receipts={receipts}
              customers={customerMap}
              onSelect={(id) => {
                setNotice(null);
                setView({ type: 'detail', id });
              }}
            />
          )}
        </div>
      )}

      {view.type === 'detail' && detailReceipt && (
        <div className="flex flex-col gap-6">
          {notice && (
            <p className="rounded-lg border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive">{notice}</p>
          )}
          {mutationError && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {mutationError.message}
            </p>
          )}
          <CustomerReceiptDetail
            receipt={detailReceipt}
            customerName={customerMap.get(detailReceipt.customerId) || 'Unknown Customer'}
            invoiceNumbers={invoiceNumbers}
            onBack={() => setView({ type: 'list' })}
            isBusy={isMutating}
            onAllocate={() => setShowAllocate(true)}
          />
        </div>
      )}

      {showForm && (
        <CustomerReceiptFormModal
          customers={customerList}
          invoices={invoices}
          defaultReceiptNumber={nextReceiptNumber}
          onSubmit={handleCreate}
          onClose={() => setShowForm(false)}
        />
      )}

      {showAllocate && detailReceipt && (
        <AllocationFormModal
          title={`Allocate ${detailReceipt.receiptNumber}`}
          openInvoices={openInvoiceOptions}
          maxAmount={detailReceipt.unallocatedAmount}
          onSubmit={handleAllocate}
          onClose={() => setShowAllocate(false)}
        />
      )}
    </>
  );
}
