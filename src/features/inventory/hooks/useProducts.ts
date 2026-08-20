import { useCallback, useEffect, useState } from 'react';
import type { Product } from '@/types';
import { productService, type CreateProductDTO, type UpdateProductDTO } from '../services/productService';

export interface UseProductsResult {
  products: Product[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createProduct: (data: CreateProductDTO) => Promise<Product>;
  updateProduct: (id: string, patch: UpdateProductDTO) => Promise<Product>;
  deleteProduct: (id: string) => Promise<void>;
}

/**
 * Component -> Hook -> Service -> Repository chain for products
 * (docs/ARCHITECTURE.md). Products pages consume this instead of ever
 * importing productService or a repository directly.
 */
export function useProducts(): UseProductsResult {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProducts(await productService.getProducts());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load products'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createProduct = useCallback(
    async (data: CreateProductDTO) => {
      const created = await productService.createProduct(data);
      await refetch();
      return created;
    },
    [refetch],
  );

  const updateProduct = useCallback(
    async (id: string, patch: UpdateProductDTO) => {
      const updated = await productService.updateProduct(id, patch);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const deleteProduct = useCallback(
    async (id: string) => {
      await productService.deleteProduct(id);
      await refetch();
    },
    [refetch],
  );

  return { products, loading, error, refetch, createProduct, updateProduct, deleteProduct };
}
