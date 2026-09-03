import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { PencilIcon } from 'lucide-react';
import { RecordActionBar, RecordPageHeader, RecordPageShell } from '@/components/app/record-page';
import { StatusBadge } from '@/components/app/status-badge';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { useAllTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useCustomerList } from '@/features/sales/hooks/useCustomerMap';
import { useBills } from '@/features/purchases/hooks/useBills';
import { useProducts } from '../hooks/useProducts';
import { useWarehouses } from '../hooks/useWarehouses';
import { useStockMovements } from '../hooks/useStockMovements';
import { useStockBalances } from '../hooks/useStockBalances';
import { useProductCategories } from '../hooks/useProductCategories';
import { InventoryItemDetail } from '../components/InventoryItemDetail';
import { ProductFormModal } from '../components/ProductFormModal';
import type { CreateProductDTO, UpdateProductDTO } from '../services/productService';

/**
 * Full-page Inventory Item detail — route `/inventory/products/:productId`.
 * The former right-hand sheet cramped the movement ledger into ~450px; the
 * 8-tab investigation view (Overview / Stock / Purchasing / Sales /
 * Transactions / Accounting / Documents / Activity) now uses the full
 * content width. Reached from both the Inventory register and the Products
 * list, and from global search. UI only — no posting/costing change.
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

  const canUpdate = useCanAccess('inventory', 'update');
  const [editing, setEditing] = useState(false);

  const state = loading ? 'loading' : error ? 'error' : product ? 'ready' : 'not-found';

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
          />

          {editing && (
            <ProductFormModal product={product} onSubmit={handleSubmit} onClose={() => setEditing(false)} />
          )}
        </>
      )}
    </RecordPageShell>
  );
}
