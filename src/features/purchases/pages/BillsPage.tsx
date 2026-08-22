import { useMemo, useState } from 'react';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { useBills } from '../hooks/useBills';
import { useBillMutations } from '../hooks/useBillMutations';
import { usePayments, usePaymentMutations } from '../hooks';
import { BillList, BillDetail, BillForm, PaymentForm, Modal } from '../components';
import { nextDocumentNumber } from '../utils/nextDocumentNumber';

/**
 * Page for managing supplier bills.
 * Displays a list of bills with filtering, sorting, and search.
 * Allows viewing details, creating, and posting bills.
 *
 * "+ New Bill" previously had no handler at all — the only real path to a
 * posted Bill was via Purchase Order conversion. See
 * docs/KNOWN_ISSUES.md's now-resolved "no way to create/post a standalone
 * Bill from the UI" entry.
 */
export function BillsPage() {
  const { bills, isLoading, error, refetch } = useBills();
  const { suppliers } = useSuppliers();
  const billMutations = useBillMutations();
  const { payments, refetch: refetchPayments } = usePayments();
  const { createPayment } = usePaymentMutations();
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const selectedBill = bills.find((b) => b.id === selectedBillId);

  const suppliersMap = useMemo(
    () => Object.fromEntries(suppliers.map((s) => [s.id, s.name])),
    [suppliers],
  );
  const outstandingBills = useMemo(
    () => bills.filter((bill) => bill.status !== 'void' && bill.total > bill.amountPaid),
    [bills],
  );

  async function runAction(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed.');
    }
  }

  async function handleCreate(data: Parameters<typeof billMutations.createBill>[0]) {
    await billMutations.createBill(data);
    await refetch();
    setShowCreateModal(false);
  }

  /**
   * Deliberately does NOT catch — PaymentForm's own onSubmit handler
   * already wraps this in try/catch and shows the error inline in the
   * modal, same pattern PaymentsPage.handleCreate() uses.
   */
  async function handleRecordPayment(data: Parameters<typeof createPayment>[0]) {
    await createPayment(data);
    await Promise.all([refetchPayments(), refetch()]);
    setShowRecordPayment(false);
  }

  if (selectedBill) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSelectedBillId(null)}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-secondary text-text-primary hover:bg-secondary/80 transition-colors"
          >
            ← Back to Bills
          </button>
          <h1 className="text-2xl font-bold">Bill Details</h1>
        </div>
        {actionError && (
          <p role="alert" className="rounded-md border border-danger bg-danger/10 px-4 py-2 text-sm text-danger">
            {actionError}
          </p>
        )}
        <BillDetail
          bill={selectedBill}
          suppliersMap={suppliersMap}
          onClose={() => setSelectedBillId(null)}
          onPost={(id) => void runAction(() => billMutations.postBill(id))}
          onRecordPayment={() => setShowRecordPayment(true)}
        />

        {showRecordPayment && (
          <Modal title={`Record Payment — ${selectedBill.billNumber}`} onClose={() => setShowRecordPayment(false)} wide>
            <PaymentForm
              suppliers={suppliers}
              outstandingBills={outstandingBills}
              defaultPaymentNumber={nextDocumentNumber(payments.map((p) => p.paymentNumber), 'PAY')}
              presetBillId={selectedBill.id}
              onSubmit={handleRecordPayment}
              onCancel={() => setShowRecordPayment(false)}
            />
          </Modal>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Supplier Bills</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-text-on-primary hover:bg-primary/90 transition-colors"
        >
          + New Bill
        </button>
      </div>
      {actionError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-4 py-2 text-sm text-danger">
          {actionError}
        </p>
      )}
      <BillList
        bills={bills}
        onSelect={setSelectedBillId}
        isLoading={isLoading}
        error={error?.message}
      />

      {showCreateModal && (
        <Modal title="New Bill" onClose={() => setShowCreateModal(false)} wide>
          <BillForm
            suppliers={suppliers}
            defaultBillNumber={nextDocumentNumber(bills.map((b) => b.billNumber), 'BILL')}
            onSubmit={handleCreate}
            onCancel={() => setShowCreateModal(false)}
          />
        </Modal>
      )}
    </div>
  );
}
