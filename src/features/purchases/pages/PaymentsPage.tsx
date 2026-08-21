import { useMemo, useState } from 'react';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { usePayments, usePaymentMutations, useBills } from '../hooks';
import { PaymentList, PaymentForm, Modal } from '../components';
import { nextDocumentNumber } from '../utils/nextDocumentNumber';
import type { CreatePaymentDTO } from '../services';

/**
 * Payment Register: a list of recorded vendor payments plus a form to
 * record a new one, allocated across that supplier's open bills. Follows
 * BillsPage's page shape (list + create modal, no separate detail route —
 * a posted Payment has no further status transitions to drill into, unlike
 * a Bill or Purchase Order).
 */
export function PaymentsPage() {
  const { payments, isLoading, error, refetch } = usePayments();
  const { bills, refetch: refetchBills } = useBills();
  const { suppliers } = useSuppliers();
  const { createPayment, isLoading: isSubmittingPayment } = usePaymentMutations();

  const [showCreateModal, setShowCreateModal] = useState(false);

  const suppliersMap = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const outstandingBills = useMemo(
    () => bills.filter((bill) => bill.status !== 'void' && bill.total > bill.amountPaid),
    [bills],
  );

  async function handleCreate(data: CreatePaymentDTO) {
    await createPayment(data);
    await Promise.all([refetch(), refetchBills()]);
    setShowCreateModal(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Payment Register</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          disabled={isSubmittingPayment}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-text-on-primary hover:bg-primary/90 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Record Payment
        </button>
      </div>

      <PaymentList payments={payments} suppliersMap={suppliersMap} isLoading={isLoading} error={error?.message} />

      {showCreateModal && (
        <Modal title="Record Payment" onClose={() => setShowCreateModal(false)} wide>
          <PaymentForm
            suppliers={suppliers}
            outstandingBills={outstandingBills}
            defaultPaymentNumber={nextDocumentNumber(payments.map((p) => p.paymentNumber), 'PAY')}
            onSubmit={handleCreate}
            onCancel={() => setShowCreateModal(false)}
          />
        </Modal>
      )}
    </div>
  );
}
