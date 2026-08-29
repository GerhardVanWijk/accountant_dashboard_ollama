import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import type { Product } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { formatCurrency } from '@/lib/app/format';
import { useProducts } from '../hooks/useProducts';
import { useStockAlerts } from '../hooks/useStockAlerts';
import { useWarehouses } from '../hooks/useWarehouses';
import { useStockMovements } from '../hooks/useStockMovements';
import { useAllTaxRates } from '@/features/tax/hooks/useTaxRates';
import { ProductsTable } from '../components/ProductsTable';
import { ProductDetailSheet } from '../components/ProductDetailSheet';
import { ProductFormModal } from '../components/ProductFormModal';
import { calculateInventoryTotals } from '../utils/calculateInventoryTotals';
import type { CreateProductDTO, UpdateProductDTO } from '../services/productService';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';

type DialogState = { mode: 'create' } | { mode: 'edit'; product: Product } | null;

/**
 * Products & Services directory — route `/inventory/products`. Real
 * useProducts()/productService data throughout. Re-skinned onto v0's
 * PageHeader/SectionCard/DataTable/Dialog (M8), matching
 * accounting-v0-frontend's Inventory page shape. Summary row restored in
 * the Phase 5 audit — it was dropped during the original re-skin; figures
 * come from the pure `calculateInventoryTotals()` rollup over already-
 * fetched Products (tracked-inventory only, matching the real
 * `Product.trackInventory` distinction v0's mock has no equivalent of) and
 * the already-existing `useStockAlerts()` (same service methods
 * LowStockAlertWidget uses) for "Below reorder level" — no new calculation
 * logic invented.
 */
export function ProductsPage() {
  const { products, loading, error, refetch, createProduct, updateProduct, deleteProduct } = useProducts();
  const { lowStock, outOfStock } = useStockAlerts();
  const { warehouses } = useWarehouses();
  const { movements } = useStockMovements();
  const { taxRates } = useAllTaxRates();
  const [dialog, setDialog] = useState<DialogState>(null);
  const canCreate = useCanAccess('inventory', 'create');
  const canUpdate = useCanAccess('inventory', 'update');
  const canDelete = useCanAccess('inventory', 'delete');

  const warehousesById = useMemo(() => new Map(warehouses.map((w) => [w.id, w])), [warehouses]);

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedProductId = searchParams.get('record') ?? undefined;
  const detailOpen = Boolean(selectedProductId);
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
  const detailProduct = products.find((p) => p.id === selectedProductId);

  const totals = calculateInventoryTotals(products);
  const belowReorderCount = lowStock.length + outOfStock.length;

  const handleSubmit = async (data: CreateProductDTO | UpdateProductDTO) => {
    if (dialog?.mode === 'edit') {
      await updateProduct(dialog.product.id, data as UpdateProductDTO);
    } else {
      await createProduct(data as CreateProductDTO);
    }
    setDialog(null);
  };

  const handleDelete = async (product: Product) => {
    if (window.confirm(`Delete "${product.name}"? This cannot be undone.`)) {
      await deleteProduct(product.id);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Products & services"
        description="Item catalogue — SKUs, pricing, tax and stock status."
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setDialog({ mode: 'create' })}>
              <Plus data-icon="inline-start" />
              New product
            </Button>
          ) : undefined
        }
      />

      <SectionCard>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <FigureBlock label="Stock at cost" value={formatCurrency(totals.stockValueAtCost)} hint={`${totals.lineCount} stock lines`} />
          <FigureBlock label="Stock at selling price" value={formatCurrency(totals.stockValueAtSelling)} hint="If sold at list price" />
          <FigureBlock label="Potential margin" value={formatCurrency(totals.potentialMargin)} hint="Selling less cost" tone="positive" />
          <FigureBlock label="Below reorder level" value={String(belowReorderCount)} hint="Needing replenishment" tone={belowReorderCount > 0 ? 'warning' : 'default'} />
        </div>
      </SectionCard>

      {loading && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading products…</p>
        </div>
      )}
      {!loading && error && (
        <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error.message}</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && (
        <SectionCard title="Stock on hand" description="Quantities, unit cost and the value carried for each line.">
          <ProductsTable
            products={products}
            onEdit={canUpdate ? (product) => setDialog({ mode: 'edit', product }) : undefined}
            onDelete={canDelete ? (product) => void handleDelete(product) : undefined}
            onSelect={(product) => openRecord(product.id)}
          />
        </SectionCard>
      )}

      <ProductDetailSheet
        product={detailProduct}
        movements={movements}
        warehousesById={warehousesById}
        taxRates={taxRates}
        open={detailOpen}
        onOpenChange={(next) => {
          if (!next) closeRecord();
        }}
      />

      {dialog && (
        <ProductFormModal
          product={dialog.mode === 'edit' ? dialog.product : undefined}
          onSubmit={handleSubmit}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
