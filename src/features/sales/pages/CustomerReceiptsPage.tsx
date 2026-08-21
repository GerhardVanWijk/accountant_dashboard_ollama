import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { CustomerReceiptList } from '@/features/sales/components/CustomerReceiptList';
import { CustomerReceiptDetail } from '@/features/sales/components/CustomerReceiptDetail';
import { CustomerReceiptForm } from '@/features/sales/components/CustomerReceiptForm';
import { AllocationForm, type OpenInvoiceOption } from '@/features/sales/components/AllocationForm';
import { Modal } from '@/features/sales/components/Modal';
import { useCustomerReceipts } from '@/features/sales/hooks/useCustomerReceipts';
import { useCustomerReceiptMutations } from '@/features/sales/hooks/useCustomerReceiptMutations';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useCustomerMap, useCustomerList } from '@/features/sales/hooks/useCustomerMap';

type View = { type: 'list' } | { type: 'detail'; id: string };

/** Outstanding-balance epsilon, matching CustomerReceiptService.BALANCE_EPSILON. */
const EPSILON = 0.01;

/**
 * Route target for /sales/receipts. Assembles the Customer Receipt
 * list/detail views, the record-receipt intake form (with initial
 * allocations), and the "apply on-account balance" follow-up allocation.
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
  } = useCustomerReceiptMutations({
    onSuccess: () => refetch(),
  });

  const nextReceiptNumber = `RCT-${new Date().getFullYear()}-${String(receipts.length + 1).padStart(4, '0')}`;

  const invoiceNumbers = new Map(invoices.map((inv) => [inv.id, inv.invoiceNumber]));

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
    <div className="flex flex-col gap-lg">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Customer Receipts</h1>
        {view.type === 'list' && (
          <Button variant="primary" onClick={() => setShowForm(true)}>
            <Icon name="add" size={16} />
            Record Receipt
          </Button>
        )}
      </div>

      {notice && (
        <p className="rounded-md border border-positive bg-positive/10 px-sm py-xs text-sm text-positive">{notice}</p>
      )}
      {mutationError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-sm py-xs text-sm text-danger">
          {mutationError.message}
        </p>
      )}

      {view.type === 'list' && (
        <CustomerReceiptList
          receipts={receipts}
          customers={customerMap}
          onSelect={(id) => {
            setNotice(null);
            setView({ type: 'detail', id });
          }}
          isLoading={isLoading}
          error={error?.message}
        />
      )}

      {view.type === 'detail' && detailReceipt && (
        <CustomerReceiptDetail
          receipt={detailReceipt}
          customerName={customerMap.get(detailReceipt.customerId) || 'Unknown Customer'}
          invoiceNumbers={invoiceNumbers}
          onClose={() => setView({ type: 'list' })}
          isBusy={isMutating}
          onAllocate={() => setShowAllocate(true)}
        />
      )}

      {showForm && (
        <Modal title="Record Customer Receipt" onClose={() => setShowForm(false)} wide>
          <CustomerReceiptForm
            customers={customerList}
            invoices={invoices}
            defaultReceiptNumber={nextReceiptNumber}
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
          />
        </Modal>
      )}

      {showAllocate && detailReceipt && (
        <Modal title={`Allocate ${detailReceipt.receiptNumber}`} onClose={() => setShowAllocate(false)}>
          <AllocationForm
            openInvoices={openInvoiceOptions}
            maxAmount={detailReceipt.unallocatedAmount}
            onSubmit={handleAllocate}
            onCancel={() => setShowAllocate(false)}
          />
        </Modal>
      )}
    </div>
  );
}
