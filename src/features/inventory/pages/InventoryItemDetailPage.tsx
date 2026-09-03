import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PencilIcon } from 'lucide-react';
import type { StockMovement, StockMovementSourceType } from '@/types';
import {
  RecordActionBar,
  RecordPageHeader,
  RecordPageShell,
  RelatedRecordPreview,
  resolveSourceDocument,
  type RelatedRecordType,
} from '@/components/app/record-page';
import { StatusBadge } from '@/components/app/status-badge';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { useAllTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useCustomerList } from '@/features/sales/hooks/useCustomerMap';
import { useCreditNotes } from '@/features/sales/hooks/useCreditNotes';
import { useQuotes } from '@/features/sales/hooks/useQuotes';
import { useSalesOrders } from '@/features/sales/hooks/useSalesOrders';
import { useBills } from '@/features/purchases/hooks/useBills';
import { usePurchaseOrders } from '@/features/purchases/hooks/usePurchaseOrders';
import { useJournalEntries } from '@/features/accounting/hooks/useJournalEntries';
import { useProducts } from '../hooks/useProducts';
import { useWarehouses } from '../hooks/useWarehouses';
import { useStockMovements } from '../hooks/useStockMovements';
import { useStockBalances } from '../hooks/useStockBalances';
import { useProductCategories } from '../hooks/useProductCategories';
import { useStockAdjustments } from '../hooks/useStockAdjustments';
import { useStockTransfers } from '../hooks/useStockTransfers';
import { useStockTakes } from '../hooks/useStockTakes';
import { useSupplierReturns } from '../hooks/useSupplierReturns';
import { useOpeningStockBatches } from '../hooks/useOpeningStockBatches';
import { InventoryItemDetail, type MovementAccounting } from '../components/InventoryItemDetail';
import { ProductFormModal } from '../components/ProductFormModal';
import type { CreateProductDTO, UpdateProductDTO } from '../services/productService';

/** Engine posting-key suffix per source type (matches the *Service postingKey conventions). */
const POSTING_KEY_SUFFIX: Partial<Record<StockMovementSourceType, string>> = {
  invoice: 'post',
  bill: 'post',
  credit_note: 'issue',
  stock_adjustment: 'post',
  stock_take: 'post',
  supplier_return: 'post',
  opening_stock_batch: 'post',
};

/** The inventory-side contra account + a one-line relationship note, keyed by movement type. */
const MOVEMENT_ACCOUNTING: Record<
  StockMovement['type'],
  { contra?: string; relationship?: string }
> = {
  goods_received: {
    contra: '2050 Goods Received Not Invoiced → 2000 Accounts Payable',
    relationship: 'Stock in at cost; the offsetting credit is GRNI, cleared to Accounts Payable when the bill posts.',
  },
  purchase_return: {
    contra: '2000 Accounts Payable / 5060 Purchase Price Variance',
    relationship: 'Stock out at WAC; supplier credit vs carrying cost lands in Purchase Price Variance.',
  },
  sale: {
    contra: '5000 Cost of Goods Sold',
    relationship: 'COGS recognised on this issue; the AR / Sales / VAT-output legs are on the same journal entry.',
  },
  sales_return: {
    contra: '5000 Cost of Goods Sold',
    relationship: 'Stock back in at WAC; COGS is reversed against the credit note.',
  },
  transfer_in: { contra: '1210 Inventory in Transit', relationship: 'Inter-warehouse move; no P&L effect.' },
  transfer_out: { contra: '1210 Inventory in Transit', relationship: 'Inter-warehouse move; no P&L effect.' },
  adjustment: { contra: '5050 Inventory Adjustments', relationship: 'Physical stock difference expensed / credited to Inventory Adjustments.' },
  write_off: { contra: '5050 Inventory Adjustments', relationship: 'Stock written off to Inventory Adjustments.' },
  stock_gain: { contra: '5050 Inventory Adjustments', relationship: 'Stock gain credited to Inventory Adjustments.' },
  stock_take: { contra: '5050 Inventory Adjustments', relationship: 'Net count variance posted to Inventory Adjustments.' },
  correction: { contra: '5050 Inventory Adjustments', relationship: 'Correcting movement.' },
  opening: { contra: '3950 Opening Balance Equity', relationship: 'Opening stock brought in against Opening Balance Equity.' },
};

/**
 * Full-page Inventory Item detail — route `/inventory/products/:productId`.
 * The 8-tab investigation view (Overview / Stock / Purchasing / Sales /
 * Transactions / Accounting / Documents / Activity) uses the full content
 * width. The Transactions ledger resolves every movement's structured
 * `source_document_type` / `source_document_id` to the real human document
 * number (INV-1072, BILL-2031, …) — never a UUID — and clicking it opens a
 * <RelatedRecordPreview> OVER this page rather than navigating away. UI
 * only — no posting/costing change.
 */
export function InventoryItemDetailPage() {
  const { productId } = useParams<{ productId: string }>();

  const { products, loading, error, refetch, updateProduct } = useProducts();
  const product = products.find((p) => p.id === productId);

  const { warehouses } = useWarehouses();
  const { movements } = useStockMovements();
  const { balances } = useStockBalances();
  const { categories } = useProductCategories();
  const { suppliers } = useSuppliers();
  const { taxRates, loading: taxRatesLoading, error: taxRatesError } = useAllTaxRates();
  const { invoices } = useInvoices();
  const { bills } = useBills();
  const { customers } = useCustomerList();
  const { creditNotes } = useCreditNotes();
  const { quotes } = useQuotes();
  const { salesOrders } = useSalesOrders();
  const { purchaseOrders } = usePurchaseOrders();
  const { adjustments } = useStockAdjustments();
  const { transfers } = useStockTransfers();
  const { stockTakes } = useStockTakes();
  const { supplierReturns } = useSupplierReturns();
  const { batches } = useOpeningStockBatches();
  const { entries: journalEntries } = useJournalEntries();

  const canUpdate = useCanAccess('inventory', 'update');
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState<{ type: RelatedRecordType; id: string; title: string } | null>(null);

  const state = loading ? 'loading' : error ? 'error' : product ? 'ready' : 'not-found';

  const numberById = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of invoices) map.set(i.id, i.invoiceNumber);
    for (const b of bills) map.set(b.id, b.billNumber);
    for (const c of creditNotes) map.set(c.id, c.creditNoteNumber);
    for (const q of quotes) map.set(q.id, q.quoteNumber);
    for (const o of salesOrders) map.set(o.id, o.orderNumber);
    for (const p of purchaseOrders) map.set(p.id, p.poNumber);
    for (const a of adjustments) map.set(a.id, a.adjustmentNumber);
    for (const t of transfers) map.set(t.id, t.transferNumber);
    for (const s of stockTakes) map.set(s.id, s.stockTakeNumber);
    for (const r of supplierReturns) map.set(r.id, r.returnNumber);
    for (const batch of batches) map.set(batch.id, batch.batchNumber);
    return map;
  }, [invoices, bills, creditNotes, quotes, salesOrders, purchaseOrders, adjustments, transfers, stockTakes, supplierReturns, batches]);

  const journalEntryIdBySource = useMemo(() => {
    const map = new Map<string, string>();
    const put = (id: string, jeId?: string) => {
      if (jeId) map.set(id, jeId);
    };
    for (const i of invoices) put(i.id, i.journalEntryId);
    for (const b of bills) put(b.id, b.journalEntryId);
    for (const c of creditNotes) put(c.id, c.journalEntryId);
    for (const p of purchaseOrders) put(p.id, p.journalEntryId);
    for (const a of adjustments) put(a.id, a.journalEntryId);
    for (const s of stockTakes) put(s.id, s.journalEntryId);
    for (const r of supplierReturns) put(r.id, r.journalEntryId);
    for (const batch of batches) put(batch.id, batch.journalEntryId);
    for (const t of transfers) {
      // A transfer has two entries — expose whichever exists; the ledger
      // row's movement type (in/out) tells the user which leg it is.
      put(t.id, t.dispatchedJournalEntryId ?? t.receivedJournalEntryId);
    }
    return map;
  }, [invoices, bills, creditNotes, purchaseOrders, adjustments, stockTakes, supplierReturns, batches, transfers]);

  const journalNumberById = useMemo(
    () => new Map(journalEntries.map((e) => [e.id, e.entryNumber])),
    [journalEntries],
  );

  const ledgerHelpers = useMemo(
    () => ({
      resolveSource: (m: StockMovement) =>
        resolveSourceDocument(
          { type: m.sourceDocumentType, id: m.sourceDocumentId, reference: m.reference },
          (_type, id) => numberById.get(id),
        ),
      resolveAccounting: (m: StockMovement): MovementAccounting | undefined => {
        const meta = MOVEMENT_ACCOUNTING[m.type];
        const jeId = m.sourceDocumentId ? journalEntryIdBySource.get(m.sourceDocumentId) : undefined;
        const journalNumber = jeId ? journalNumberById.get(jeId) : undefined;
        let postingKey: string | undefined;
        if (m.sourceDocumentType && m.sourceDocumentId) {
          if (m.sourceDocumentType === 'stock_transfer') {
            postingKey = `stock_transfer:${m.sourceDocumentId}:${m.type === 'transfer_out' ? 'dispatch' : 'receive'}`;
          } else {
            const suffix = POSTING_KEY_SUFFIX[m.sourceDocumentType];
            postingKey = suffix ? `${m.sourceDocumentType}:${m.sourceDocumentId}:${suffix}` : undefined;
          }
        }
        if (!jeId && !postingKey && !meta.contra) return undefined;
        return {
          journalEntryId: jeId,
          journalNumber,
          postingKey,
          inventoryAccount: '1200 Inventory',
          contraAccount: meta.contra,
          contraRelationship: meta.relationship,
          isReversal: m.type === 'correction' || Boolean(m.reversalOfMovementId),
        };
      },
      onOpenPreview: (type: RelatedRecordType, id: string, title: string) => setPreview({ type, id, title }),
    }),
    [numberById, journalEntryIdBySource, journalNumberById],
  );

  async function handleSubmit(data: CreateProductDTO | UpdateProductDTO) {
    if (!product) return;
    await updateProduct(product.id, data as UpdateProductDTO);
    setEditing(false);
    void refetch();
  }

  return (
    <RecordPageShell
      breadcrumbs={[
        { label: 'Inventory', to: '/inventory' },
        { label: 'Products', to: '/inventory/products' },
        { label: product?.sku ?? 'Item' },
      ]}
      backTo="/inventory/products"
      backLabel="Products"
      state={state}
      errorMessage={error?.message}
      notFoundMessage="This item could not be found — it may have been deleted."
    >
      {product && (
        <>
          <RecordPageHeader
            recordNumber={product.sku}
            title={product.name}
            meta={`${product.type === 'service' ? 'Service' : 'Good'}${product.trackInventory ? ' · stock-tracked' : ''}`}
            status={<StatusBadge status={product.status} />}
            actions={
              canUpdate ? (
                <RecordActionBar secondary={[{ label: 'Edit item', icon: PencilIcon, onClick: () => setEditing(true) }]} />
              ) : undefined
            }
          />

          <InventoryItemDetail
            product={product}
            movements={movements}
            balances={balances}
            warehouses={warehouses}
            categories={categories}
            suppliers={suppliers}
            taxRates={taxRates}
            taxRatesPending={taxRatesLoading || Boolean(taxRatesError)}
            invoices={invoices}
            bills={bills}
            customers={customers}
            ledgerHelpers={ledgerHelpers}
          />

          {editing && (
            <ProductFormModal product={product} onSubmit={handleSubmit} onClose={() => setEditing(false)} />
          )}

          <RelatedRecordPreview
            open={preview != null}
            type={preview?.type}
            id={preview?.id}
            title={preview?.title}
            onClose={() => setPreview(null)}
          />
        </>
      )}
    </RecordPageShell>
  );
}
