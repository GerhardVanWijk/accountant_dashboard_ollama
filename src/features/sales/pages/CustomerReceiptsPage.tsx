import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { useLegacyRecordRedirect } from '@/components/app/record-page';
import { formatCurrency } from '@/lib/app/format';
import { CustomerReceiptList } from '@/features/sales/components/CustomerReceiptList';
import { CustomerReceiptFormModal } from '@/features/sales/components/CustomerReceiptFormModal';
import { useCustomerReceipts } from '@/features/sales/hooks/useCustomerReceipts';
import { useCustomerReceiptMutations } from '@/features/sales/hooks/useCustomerReceiptMutations';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useCustomerMap, useCustomerList } from '@/features/sales/hooks/useCustomerMap';
import { receiptAllocationState } from '@/features/sales/utils/receiptAllocationState';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';

/**
 * Route target for /sales/receipts (nav label "Payments") — the list only.
 * A row click navigates to the full-page record at
 * `/sales/receipts/:receiptId` (CustomerReceiptDetailPage); legacy
 * `?record=<id>` deep links are redirected there. Allocation lives on the
 * record page.
 */
export function CustomerReceiptsPage() {
  const navigate = useNavigate();
  useLegacyRecordRedirect('/sales/receipts');

  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { receipts, isLoading, error, refetch } = useCustomerReceipts();
  const { customers: customerMap } = useCustomerMap();
  const { customers: customerList } = useCustomerList();
  const { invoices, refetch: refetchInvoices } = useInvoices();
  const { recordReceipt, error: mutationError } = useCustomerReceiptMutations({ onSuccess: () => refetch() });
  const canRecord = useCanAccess('sales_documents', 'post');

  const nextReceiptNumber = `RCT-${new Date().getFullYear()}-${String(receipts.length + 1).padStart(4, '0')}`;

  const receivedTotal = receipts.reduce((sum, r) => sum + r.amount, 0);
  const unallocated = receipts.filter((r) => receiptAllocationState(r) !== 'allocated');
  const unallocatedTotal = unallocated.reduce((sum, r) => sum + r.unallocatedAmount, 0);

  async function handleCreate(data: Parameters<typeof recordReceipt>[0]) {
    await recordReceipt(data);
    await refetchInvoices();
    setShowForm(false);
    setNotice('Receipt recorded and posted to the ledger.');
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Payments"
          description="Money received from customers, with allocation status against open invoices."
          actions={
            canRecord ? (
              <Button size="sm" onClick={() => setShowForm(true)}>
                <Plus data-icon="inline-start" />
                Record receipt
              </Button>
            ) : undefined
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
          <p className="rounded-lg border border-status-positive-outline bg-status-positive-surface px-3 py-2 text-sm text-status-positive">{notice}</p>
        )}
        {mutationError && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {mutationError.message}
          </p>
        )}

        {isLoading ? (
          <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            <p className="text-sm">Loading customer receipts…</p>
          </div>
        ) : error ? (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error.message}
          </div>
        ) : (
          <CustomerReceiptList
            receipts={receipts}
            customers={customerMap}
            onSelect={(id) => {
              setNotice(null);
              navigate(`/sales/receipts/${id}`);
            }}
          />
        )}
      </div>

      {showForm && (
        <CustomerReceiptFormModal
          customers={customerList}
          invoices={invoices}
          defaultReceiptNumber={nextReceiptNumber}
          onSubmit={handleCreate}
          onClose={() => setShowForm(false)}
        />
      )}
    </>
  );
}
