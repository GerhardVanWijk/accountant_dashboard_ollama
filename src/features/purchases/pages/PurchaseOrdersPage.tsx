import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { usePurchaseOrders, usePurchaseOrderMutations, useBillMutations } from '../hooks';
import { PurchaseOrderList, PurchaseOrderDetail, PurchaseOrderForm, Modal } from '../components';
import { nextDocumentNumber } from '../utils/nextDocumentNumber';
import type { CreatePurchaseOrderDTO } from '../services';

/**
 * Purchase Orders page: list/detail toggle + create modal, following
 * BillsPage's shape. "Convert to Bill" composes two already-built
 * capabilities rather than adding new business logic here:
 * purchaseOrderService.convertToBill() (via usePurchaseOrderMutations)
 * builds the Bill draft, then billService.createBill()/postBill() (via
 * useBillMutations) persists it and posts the real GL entry — postBill()
 * only accepts a 'draft' bill, so the draft's status is forced to 'draft'
 * before it's created, guaranteeing the real GL validation in
 * BillService.postBill() always runs (never bypassed).
 */
export function PurchaseOrdersPage() {
  const { purchaseOrders, isLoading, error, refetch } = usePurchaseOrders();
  const { suppliers } = useSuppliers();
  const poMutations = usePurchaseOrderMutations();
  const billMutations = useBillMutations();
  const navigate = useNavigate();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const selectedPurchaseOrder = purchaseOrders.find((po) => po.id === selectedId);
  const suppliersMap = useMemo(
    () => Object.fromEntries(suppliers.map((s) => [s.id, s.name])),
    [suppliers],
  );

  const isBusy = poMutations.isLoading || billMutations.isLoading;

  async function runAction(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed.');
    }
  }

  async function handleConvertToBill(poId: string) {
    setActionError(null);
    try {
      const draft = await poMutations.convertToBill(poId);
      const bill = await billMutations.createBill({ ...draft, status: 'draft' });
      await billMutations.postBill(bill.id);
      navigate('/purchases/bills');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not convert purchase order to a bill.');
    }
  }

  async function handleCreate(data: CreatePurchaseOrderDTO) {
    await poMutations.createPurchaseOrder(data);
    await refetch();
    setShowCreateModal(false);
  }

  if (selectedPurchaseOrder) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSelectedId(null)}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-secondary text-text-primary hover:bg-secondary/80 transition-colors"
          >
            ← Back to Purchase Orders
          </button>
          <h1 className="text-2xl font-bold">Purchase Order Details</h1>
        </div>
        {actionError && (
          <p role="alert" className="rounded-md border border-danger bg-danger/10 px-4 py-2 text-sm text-danger">
            {actionError}
          </p>
        )}
        <PurchaseOrderDetail
          purchaseOrder={selectedPurchaseOrder}
          suppliersMap={suppliersMap}
          onClose={() => setSelectedId(null)}
          onSend={(id) => void runAction(() => poMutations.sendPurchaseOrder(id))}
          onRecordReceipt={(id) => void runAction(() => poMutations.recordReceipt(id))}
          onCancel={(id) => void runAction(() => poMutations.updatePurchaseOrder(id, { status: 'cancelled' }))}
          onConvertToBill={(id) => void handleConvertToBill(id)}
          isBusy={isBusy}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Purchase Orders</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-text-on-primary hover:bg-primary/90 transition-colors"
        >
          + New Purchase Order
        </button>
      </div>
      {actionError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-4 py-2 text-sm text-danger">
          {actionError}
        </p>
      )}
      <PurchaseOrderList
        purchaseOrders={purchaseOrders}
        onSelect={setSelectedId}
        isLoading={isLoading}
        error={error?.message}
      />

      {showCreateModal && (
        <Modal title="New Purchase Order" onClose={() => setShowCreateModal(false)} wide>
          <PurchaseOrderForm
            suppliers={suppliers}
            defaultPoNumber={nextDocumentNumber(purchaseOrders.map((po) => po.poNumber), 'PO')}
            onSubmit={handleCreate}
            onCancel={() => setShowCreateModal(false)}
          />
        </Modal>
      )}
    </div>
  );
}
