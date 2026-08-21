import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { SalesOrderList } from '@/features/sales/components/SalesOrderList';
import { SalesOrderDetail } from '@/features/sales/components/SalesOrderDetail';
import { SalesOrderForm } from '@/features/sales/components/SalesOrderForm';
import { Modal } from '@/features/sales/components/Modal';
import { useSalesOrders } from '@/features/sales/hooks/useSalesOrders';
import { useSalesOrderMutations } from '@/features/sales/hooks/useSalesOrderMutations';
import { useQuotes } from '@/features/sales/hooks/useQuotes';
import { useCustomerMap, useCustomerList } from '@/features/sales/hooks/useCustomerMap';

type View = { type: 'list' } | { type: 'detail'; id: string };

/**
 * Route target for /sales/orders. Assembles the Sales Order list/detail
 * views and create form, plus the Sales Order -> Invoice conversion action.
 */
export function SalesOrdersPage() {
  const [view, setView] = useState<View>({ type: 'list' });
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { salesOrders, isLoading, error, refetch } = useSalesOrders();
  const detailOrder = view.type === 'detail' ? salesOrders.find((o) => o.id === view.id) : undefined;
  const { customers: customerMap } = useCustomerMap();
  const { customers: customerList } = useCustomerList();
  // Only needed to show "Converted from quote QUO-..." on a detail view.
  const { quotes } = useQuotes();
  const {
    createSalesOrder,
    confirmOrder,
    cancelOrder,
    convertToInvoice,
    isLoading: isMutating,
    error: mutationError,
  } = useSalesOrderMutations({
    onSuccess: () => refetch(),
  });

  const nextOrderNumber = `SO-${new Date().getFullYear()}-${String(salesOrders.length + 1).padStart(4, '0')}`;

  async function handleCreate(data: Parameters<typeof createSalesOrder>[0]) {
    await createSalesOrder(data);
    setShowForm(false);
  }

  async function handleTransition(action: (id: string) => Promise<unknown>, id: string, message: string) {
    await action(id);
    setNotice(message);
  }

  async function handleConvert(id: string) {
    const invoice = await convertToInvoice(id);
    await refetch();
    setNotice(`Converted to draft Invoice ${invoice.invoiceNumber}. Find it on the Invoices page.`);
    setView({ type: 'list' });
  }

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sales Orders</h1>
        {view.type === 'list' && (
          <Button variant="primary" onClick={() => setShowForm(true)}>
            <Icon name="add" size={16} />
            New Sales Order
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
        <SalesOrderList
          salesOrders={salesOrders}
          customers={customerMap}
          onSelect={(id) => {
            setNotice(null);
            setView({ type: 'detail', id });
          }}
          isLoading={isLoading}
          error={error?.message}
        />
      )}

      {view.type === 'detail' && detailOrder && (
        <SalesOrderDetail
          salesOrder={detailOrder}
          customerName={customerMap.get(detailOrder.customerId) || 'Unknown Customer'}
          quoteNumber={quotes.find((q) => q.id === detailOrder.quoteId)?.quoteNumber}
          onClose={() => setView({ type: 'list' })}
          isBusy={isMutating}
          onConfirmOrder={(id) => void handleTransition(confirmOrder, id, 'Sales order confirmed.')}
          onCancelOrder={(id) => void handleTransition(cancelOrder, id, 'Sales order cancelled.')}
          onConvertToInvoice={(id) => void handleConvert(id)}
        />
      )}

      {showForm && (
        <Modal title="New Sales Order" onClose={() => setShowForm(false)} wide>
          <SalesOrderForm
            customers={customerList}
            defaultOrderNumber={nextOrderNumber}
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
          />
        </Modal>
      )}
    </div>
  );
}
