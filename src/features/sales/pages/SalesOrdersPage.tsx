import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { PageHeader } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { useLegacyRecordRedirect } from '@/components/app/record-page';
import { SalesOrderList } from '@/features/sales/components/SalesOrderList';
import { SalesOrderFormModal } from '@/features/sales/components/SalesOrderFormModal';
import { useSalesOrders } from '@/features/sales/hooks/useSalesOrders';
import { useSalesOrderMutations } from '@/features/sales/hooks/useSalesOrderMutations';
import { useCustomerMap, useCustomerList } from '@/features/sales/hooks/useCustomerMap';

type FormState = { mode: 'create' } | null;

/**
 * Route target for /sales/orders — the list only. Clicking a row navigates
 * to the full-page record at `/sales/orders/:orderId`
 * (SalesOrderDetailPage), not a right-hand sheet. Legacy
 * `/sales/orders?record=<id>` links are redirected there. Sales orders
 * never post to the GL until converted (SalesOrderService).
 */
export function SalesOrdersPage() {
  const navigate = useNavigate();
  useLegacyRecordRedirect('/sales/orders');

  const [formState, setFormState] = useState<FormState>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { salesOrders, isLoading, error, refetch } = useSalesOrders();
  const { customers: customerMap } = useCustomerMap();
  const { customers: customerList } = useCustomerList();
  const { createSalesOrder } = useSalesOrderMutations({ onSuccess: () => refetch() });

  const nextOrderNumber = `SO-${new Date().getFullYear()}-${String(salesOrders.length + 1).padStart(4, '0')}`;

  async function handleCreate(data: Parameters<typeof createSalesOrder>[0]) {
    const created = await createSalesOrder(data);
    setFormState(null);
    setNotice(`Sales order ${created.orderNumber} created.`);
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Sales orders"
          description="Confirmed customer orders — nothing here posts to the GL until converted to an invoice."
          actions={
            <Button size="sm" onClick={() => setFormState({ mode: 'create' })}>
              <Plus data-icon="inline-start" />
              New sales order
            </Button>
          }
        />

        {notice && (
          <p role="status" className="rounded-lg border border-status-positive-outline bg-status-positive-surface px-3 py-2 text-sm text-status-positive">
            {notice}
          </p>
        )}

        {isLoading ? (
          <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            <p className="text-sm">Loading sales orders…</p>
          </div>
        ) : error ? (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error.message}
          </div>
        ) : (
          <SalesOrderList
            salesOrders={salesOrders}
            customers={customerMap}
            onSelect={(id) => {
              setNotice(null);
              navigate(`/sales/orders/${id}`);
            }}
          />
        )}
      </div>

      {formState?.mode === 'create' && (
        <SalesOrderFormModal
          title="New sales order"
          customers={customerList}
          defaultOrderNumber={nextOrderNumber}
          onSubmit={handleCreate}
          onClose={() => setFormState(null)}
        />
      )}
    </>
  );
}
