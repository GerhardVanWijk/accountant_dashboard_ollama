import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { useLegacyRecordRedirect } from '@/components/app/record-page';
import { formatCurrency } from '@/lib/app/format';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { usePurchaseOrders, usePurchaseOrderMutations } from '../hooks';
import { PurchaseOrderList } from '../components/PurchaseOrderList';
import { PurchaseOrderFormModal } from '../components/PurchaseOrderFormModal';
import { nextDocumentNumber } from '../utils/nextDocumentNumber';
import type { CreatePurchaseOrderDTO } from '../services';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';

/**
 * Purchase Orders — route `/purchases/orders`, the list only. A row click
 * navigates to the full-page record at
 * `/purchases/orders/:purchaseOrderId` (PurchaseOrderDetailPage); legacy
 * `?record=<id>` deep links are redirected there. Send / receive / cancel /
 * convert-to-bill all live on the record page.
 */
export function PurchaseOrdersPage() {
  const navigate = useNavigate();
  useLegacyRecordRedirect('/purchases/orders');

  const { purchaseOrders, isLoading, error, refetch } = usePurchaseOrders();
  const { suppliers } = useSuppliers();
  const poMutations = usePurchaseOrderMutations();
  const canCreate = useCanAccess('purchasing', 'create');

  const [showCreate, setShowCreate] = useState(false);

  const suppliersMap = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const openOrders = purchaseOrders.filter((po) => po.status !== 'received' && po.status !== 'cancelled');
  const totalValue = purchaseOrders.reduce((sum, po) => sum + po.total, 0);

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
            canCreate ? (
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus data-icon="inline-start" />
                New purchase order
              </Button>
            ) : undefined
          }
        />

        <SectionCard>
          <div className="grid gap-6 sm:grid-cols-3">
            <FigureBlock label="Total orders" value={String(purchaseOrders.length)} />
            <FigureBlock label="Total value" value={formatCurrency(totalValue)} hint="All orders" />
            <FigureBlock label="Open" value={String(openOrders.length)} hint="Not yet received or cancelled" tone={openOrders.length > 0 ? 'warning' : 'default'} />
          </div>
        </SectionCard>

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
          <PurchaseOrderList purchaseOrders={purchaseOrders} suppliersMap={suppliersMap} onSelect={(id) => navigate(`/purchases/orders/${id}`)} />
        )}
      </div>

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
