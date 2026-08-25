import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { Product } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/shadcn/dialog';
import { useProducts } from '../hooks/useProducts';
import { ProductsTable } from '../components/ProductsTable';
import { ProductForm } from '../components/ProductForm';
import type { CreateProductDTO, UpdateProductDTO } from '../services/productService';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';

type DialogState = { mode: 'create' } | { mode: 'edit'; product: Product } | null;

/**
 * Products & Services directory — route `/inventory/products`. Real
 * useProducts()/productService data throughout. Re-skinned onto v0's
 * PageHeader/SectionCard/DataTable/Dialog (M8), matching
 * accounting-v0-frontend's Inventory page shape.
 */
export function ProductsPage() {
  const { products, loading, error, refetch, createProduct, updateProduct, deleteProduct } = useProducts();
  const [dialog, setDialog] = useState<DialogState>(null);
  const canCreate = useCanAccess('inventory', 'create');
  const canUpdate = useCanAccess('inventory', 'update');
  const canDelete = useCanAccess('inventory', 'delete');

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
          />
        </SectionCard>
      )}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === 'edit' ? 'Edit Product' : 'New Product'}</DialogTitle>
          </DialogHeader>
          {dialog && <ProductForm product={dialog.mode === 'edit' ? dialog.product : undefined} onSubmit={handleSubmit} onCancel={() => setDialog(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
