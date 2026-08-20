import { useState } from 'react';
import type { Product } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useProducts } from '../hooks/useProducts';
import { ProductsTable } from '../components/ProductsTable';
import { ProductForm } from '../components/ProductForm';
import { Modal } from '../components/Modal';
import type { CreateProductDTO, UpdateProductDTO } from '../services/productService';

type DialogState = { mode: 'create' } | { mode: 'edit'; product: Product } | null;

/** Products & Services directory — route `/inventory/products` (docs/ROUTES.md). */
export function ProductsPage() {
  const { products, loading, error, refetch, createProduct, updateProduct, deleteProduct } = useProducts();
  const [dialog, setDialog] = useState<DialogState>(null);

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
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Products & Services</h1>
          <p className="mt-xs text-sm text-text-secondary">
            Item catalog — SKUs, pricing, tax, and stock status. /inventory/products
          </p>
        </div>
        <Button onClick={() => setDialog({ mode: 'create' })}>New Product</Button>
      </div>

      <Card>
        {loading && <Spinner label="Loading products…" />}
        {!loading && error && <ErrorState message={error.message} onRetry={refetch} />}
        {!loading && !error && products.length === 0 && (
          <EmptyState
            title="No products yet"
            message="Add your first product or service to start tracking stock."
            action={<Button onClick={() => setDialog({ mode: 'create' })}>New Product</Button>}
          />
        )}
        {!loading && !error && products.length > 0 && (
          <ProductsTable
            products={products}
            onEdit={(product) => setDialog({ mode: 'edit', product })}
            onDelete={handleDelete}
          />
        )}
      </Card>

      {dialog && (
        <Modal title={dialog.mode === 'edit' ? 'Edit Product' : 'New Product'} onClose={() => setDialog(null)}>
          <ProductForm
            product={dialog.mode === 'edit' ? dialog.product : undefined}
            onSubmit={handleSubmit}
            onCancel={() => setDialog(null)}
          />
        </Modal>
      )}
    </div>
  );
}
