import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { formatCurrency } from '@/lib/app/format';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { usePurchaseOrders, usePurchaseOrderMutations, useBillMutations, useBills } from '../hooks';
import { PurchaseOrderList } from '../components/PurchaseOrderList';
import { PurchaseOrderDetailSheet } from '../components/PurchaseOrderDetailSheet';
import { PurchaseOrderFormModal } from '../components/PurchaseOrderFormModal';
import { nextDocumentNumber } from '../utils/nextDocumentNumber';
import type { CreatePurchaseOrderDTO } from '../services';

/**
 * Purchase Orders — route `/purchases/orders`. Re-skinned onto v0's
 * PageHeader/SectionCard/Dialog (M8), following BillsPage's shape.
 * "Convert to Bill" composes two already-built capabilities rather than
 * adding new business logic here: purchaseOrderService.convertToBill()
 * builds the Bill draft, then billService.createBill()/postBill()
 * persists it and posts the real GL entry — unchanged from before the
 * port.
 */
export function PurchaseOrdersPage() {
  const { purchaseOrders, isLoading, error, refetch } = usePurchaseOrders();
  const { suppliers } = useSuppliers();
  const { bills } = useBills();
  const poMutations = usePurchaseOrderMutations();
  const billMutations = useBillMutations();
  const navigate = useNavigate();

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('record') ?? undefined;
  const detailOpen = Boolean(selectedId);
  function openRecord(id: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('record', id);
      return next;
    });
  }
  function closeRecord() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('record');
      return next;
    });
  }

  const [showCreate, setShowCreate] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const detailPo = purchaseOrders.find((po) => po.id === selectedId);
  const suppliersMap = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s.name])), [suppliers]);

  const isBusy = poMutations.isLoading || billMutations.isLoading;
  const openOrders = purchaseOrders.filter((po) => po.status !== 'received' && po.status !== 'cancelled');
  const totalValue = purchaseOrders.reduce((sum, po) => sum + po.total, 0);

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
      await poMutations.updatePurchaseOrder(poId, { billId: bill.id });
      navigate('/purchases/bills');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not convert purchase order to a bill.');
    }
  }

  async function handleCreate(data: CreatePurchaseOrderDTO) {
    await poMutations.createPurchaseOrder(data);
    await refetch();
    setShowCreate(false);
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Purchase Orders"
          description="Orders placed with suppliers, from draft through to a converted bill."
          actions={
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus data-icon="inline-start" />
              New purchase order
            </Button>
          }
        />

        <SectionCard>
          <div className="grid gap-6 sm:grid-cols-3">
            <FigureBlock label="Total orders" value={String(purchaseOrders.length)} />
            <FigureBlock label="Total value" value={formatCurrency(totalValue)} hint="All orders" />
            <FigureBlock label="Open" value={String(openOrders.length)} hint="Not yet received or cancelled" tone={openOrders.length > 0 ? 'warning' : 'default'} />
          </div>
        </SectionCard>

        {actionError && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {actionError}
          </p>
        )}

        {isLoading ? (
          <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            <p className="text-sm">Loading purchase orders…</p>
          </div>
        ) : error ? (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error.message}
          </div>
        ) : (
          <PurchaseOrderList purchaseOrders={purchaseOrders} suppliersMap={suppliersMap} onSelect={openRecord} />
        )}
      </div>

      <PurchaseOrderDetailSheet
        purchaseOrder={detailPo}
        isLoading={isLoading}
        open={detailOpen}
        onOpenChange={(next) => {
          if (!next) closeRecord();
        }}
        supplierName={detailPo ? suppliersMap[detailPo.supplierId] ?? 'Unknown supplier' : ''}
        suppliersMap={suppliersMap}
        bills={bills}
        onSend={(id) => void runAction(() => poMutations.sendPurchaseOrder(id))}
        onRecordReceipt={(id) => void runAction(() => poMutations.recordReceipt(id))}
        onCancel={(id) => void runAction(() => poMutations.updatePurchaseOrder(id, { status: 'cancelled' }))}
        onConvertToBill={(id) => void handleConvertToBill(id)}
        isBusy={isBusy}
      />

      {showCreate && (
        <PurchaseOrderFormModal
          suppliers={suppliers}
          defaultPoNumber={nextDocumentNumber(purchaseOrders.map((po) => po.poNumber), 'PO')}
          onSubmit={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}
    </>
  );
}
