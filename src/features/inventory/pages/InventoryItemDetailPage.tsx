import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PencilIcon } from 'lucide-react';
import type { StockMovement } from '@/types';
import {
  RecordActionBar,
  RecordPageHeader,
  RecordPageShell,
  RelatedRecordPreview,
  type RelatedRecordType,
} from '@/components/app/record-page';
import { StatusBadge } from '@/components/app/status-badge';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { useAllTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useCustomerList } from '@/features/sales/hooks/useCustomerMap';
import { useCreditNotes } from '@/features/sales/hooks/useCreditNotes';
import { useBills } from '@/features/purchases/hooks/useBills';
import { useJournalEntries } from '@/features/accounting/hooks/useJournalEntries';
import { useAccounts } from '@/features/accounting/hooks/useAccounts';
import { useProducts } from '../hooks/useProducts';
import { useStockMovements } from '../hooks/useStockMovements';
import { useStockBalances } from '../hooks/useStockBalances';
import { useStockCommitments } from '../hooks/useStockCommitments';
import { useStockOnOrder } from '../hooks/useStockOnOrder';
import { useProductCategories } from '../hooks/useProductCategories';
import { useStockMovementResolvers } from '../hooks/useStockMovementResolvers';
import { InventoryItemDetail } from '../components/InventoryItemDetail';
import { ProductFormModal } from '../components/ProductFormModal';
import type { CreateProductDTO, UpdateProductDTO } from '../services/productService';
import { useInventoryReconciliation } from '../hooks/useInventoryReconciliation';
import { selectProductFindings, summarizeProductIntegrity } from '../services/productIntegrity';

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

  const { movements } = useStockMovements();
  const { balances } = useStockBalances();
  const { commitments } = useStockCommitments();
  const { onOrder } = useStockOnOrder();
  const { categories } = useProductCategories();
  const { suppliers } = useSuppliers();
  const { taxRates, loading: taxRatesLoading, error: taxRatesError } = useAllTaxRates();
  const { invoices } = useInvoices();
  const { bills } = useBills();
  const { customers } = useCustomerList();
  const { creditNotes } = useCreditNotes();
  const { entries: journalEntries } = useJournalEntries();
  const { accounts } = useAccounts();

  const accountLabel = useMemo(() => {
    const byId = new Map(accounts.map((a) => [a.id, `${a.code} ${a.name}`]));
    return (id: string) => byId.get(id) ?? id;
  }, [accounts]);

  const resolvers = useStockMovementResolvers();
  const { warehouses, transfers, knownDocumentRefs } = resolvers;

  const canUpdate = useCanAccess('inventory', 'update');
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState<{ type: RelatedRecordType; id: string; title: string } | null>(null);

  const state = loading ? 'loading' : error ? 'error' : product ? 'ready' : 'not-found';

  const { result: reconResult, loading: reconLoading, error: reconError } = useInventoryReconciliation({
    knownDocumentRefs,
  });

  const integrity = useMemo(() => {
    if (!product) return undefined;
    if (!reconResult) return { summary: null, loading: reconLoading, error: reconError };
    const transferRefsForProduct = new Set<string>();
    for (const t of transfers) {
      if ((t.lineItems ?? []).some((l) => l.productId === product.id)) {
        transferRefsForProduct.add(t.id);
        transferRefsForProduct.add(t.transferNumber);
      }
    }
    const findings = selectProductFindings(reconResult, product.id, transferRefsForProduct);
    return {
      summary: summarizeProductIntegrity(findings, product.trackInventory),
      loading: reconLoading,
      error: reconError,
    };
  }, [product, reconResult, reconLoading, reconError, transfers]);

  const ledgerHelpers = useMemo(
    () => ({
      resolveSource: (m: StockMovement) => resolvers.resolveSource(m),
      resolveAccounting: (m: StockMovement) => resolvers.resolveAccounting(m),
      onOpenPreview: (type: RelatedRecordType, id: string, title: string) => setPreview({ type, id, title }),
    }),
    [resolvers],
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
            commitments={commitments}
            onOrder={onOrder}
            warehouses={warehouses}
            categories={categories}
            suppliers={suppliers}
            taxRates={taxRates}
            taxRatesPending={taxRatesLoading || Boolean(taxRatesError)}
            invoices={invoices}
            bills={bills}
            creditNotes={creditNotes}
            customers={customers}
            transfers={transfers}
            journalEntries={journalEntries}
            accounts={accounts}
            accountLabel={accountLabel}
            integrity={integrity}
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
