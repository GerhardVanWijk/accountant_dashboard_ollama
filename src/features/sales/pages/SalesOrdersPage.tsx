import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { PageHeader } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { SalesOrderList } from '@/features/sales/components/SalesOrderList';
import { SalesOrderDetailSheet } from '@/features/sales/components/SalesOrderDetailSheet';
import { SalesOrderFormModal } from '@/features/sales/components/SalesOrderFormModal';
import { useSalesOrders } from '@/features/sales/hooks/useSalesOrders';
import { useSalesOrderMutations } from '@/features/sales/hooks/useSalesOrderMutations';
import { useQuotes } from '@/features/sales/hooks/useQuotes';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useCustomerMap, useCustomerList } from '@/features/sales/hooks/useCustomerMap';

type FormState = { mode: 'create' } | null;

/**
 * Route target for /sales/orders — real useSalesOrders()/SalesOrderService
 * data throughout, v0 page shell (PageHeader), list/detail views and
 * create modal in-page-state, matching InvoicesPage.tsx's/QuotesPage.tsx's
 * convention (M13) — the DataTable-based SalesOrderList renders bare, same
 * as every sibling module's list (fixed in the Phase 4 audit, see
 * QuotesPage.tsx). No `sales`/`sales_orders` entry
 * exists in the real permission catalog (M11) — docs/PERMISSIONS.md
 * already documented Quotes/Orders as ungated alongside Credit Notes/
 * Receipts, so this route/its actions stay ungated, same as before the
 * port. The Sales Order -> Invoice conversion goes through the existing
 * `SalesOrderService.convertToInvoice()` unchanged — no invoice logic is
 * duplicated here.
 */
export function SalesOrdersPage() {
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

  const [formState, setFormState] = useState<FormState>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { salesOrders, isLoading, error, refetch } = useSalesOrders();
  const detailOrder = salesOrders.find((o) => o.id === selectedId);
  const { customers: customerMap } = useCustomerMap();
  const { customers: customerList } = useCustomerList();
  // Needed for "Source quote"/"Converted to invoice" related-record links.
  const { quotes } = useQuotes();
  const { invoices } = useInvoices();
  const {
    createSalesOrder,
    deleteSalesOrder,
    confirmOrder,
    cancelOrder,
    convertToInvoice,
    isLoading: isMutating,
  } = useSalesOrderMutations({
    onSuccess: () => refetch(),
  });

  const nextOrderNumber = `SO-${new Date().getFullYear()}-${String(salesOrders.length + 1).padStart(4, '0')}`;

  async function handleCreate(data: Parameters<typeof createSalesOrder>[0]) {
    await createSalesOrder(data);
    setFormState(null);
  }

  async function handleTransition(action: (id: string) => Promise<unknown>, id: string, message: string) {
    setActionError(null);
    try {
      await action(id);
      setNotice(message);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update sales order.');
    }
  }

  async function handleDelete(id: string) {
    setActionError(null);
    try {
      await deleteSalesOrder(id);
      closeRecord();
      setNotice('Pending sales order deleted.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete sales order.');
    }
  }

  async function handleConvert(id: string) {
    setActionError(null);
    try {
      const invoice = await convertToInvoice(id);
      await refetch();
      setNotice(`Converted to draft Invoice ${invoice.invoiceNumber}. Find it on the Invoices page.`);
      closeRecord();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not convert sales order to an invoice.');
    }
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
              setActionError(null);
              openRecord(id);
            }}
          />
        )}
      </div>

      {actionError && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <SalesOrderDetailSheet
        salesOrder={detailOrder}
        isLoading={isLoading}
        open={detailOpen}
        onOpenChange={(next) => {
          if (!next) closeRecord();
        }}
        customerName={detailOrder ? customerMap.get(detailOrder.customerId) || 'Unknown Customer' : ''}
        quotes={quotes}
        invoices={invoices}
        onDelete={detailOrder ? () => void handleDelete(detailOrder.id) : undefined}
        isBusy={isMutating}
        onConfirmOrder={(id) => void handleTransition(confirmOrder, id, 'Sales order confirmed.')}
        onCancelOrder={(id) => void handleTransition(cancelOrder, id, 'Sales order cancelled.')}
        onConvertToInvoice={(id) => void handleConvert(id)}
      />

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
