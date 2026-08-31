import { useCallback, useEffect, useState } from 'react';
import type { ProductCategory } from '@/types';
import {
  productCategoryService,
  type CreateProductCategoryDTO,
  type UpdateProductCategoryDTO,
} from '../services/productCategoryService';

export interface UseProductCategoriesResult {
  categories: ProductCategory[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createCategory: (data: CreateProductCategoryDTO) => Promise<ProductCategory>;
  updateCategory: (id: string, patch: UpdateProductCategoryDTO) => Promise<ProductCategory>;
  deleteCategory: (id: string) => Promise<void>;
}

/**
 * Component → Hook → Service → Repository chain for product categories
 * (fork B; migration 0024). Categories pages consume this rather than
 * importing `productCategoryService` directly.
 */
export function useProductCategories(): UseProductCategoriesResult {
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCategories(await productCategoryService.getCategories());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load product categories'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createCategory = useCallback(
    async (data: CreateProductCategoryDTO) => {
      const created = await productCategoryService.createCategory(data);
      await refetch();
      return created;
    },
    [refetch],
  );

  const updateCategory = useCallback(
    async (id: string, patch: UpdateProductCategoryDTO) => {
      const updated = await productCategoryService.updateCategory(id, patch);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      await productCategoryService.deleteCategory(id);
      await refetch();
    },
    [refetch],
  );

  return { categories, loading, error, refetch, createCategory, updateCategory, deleteCategory };
}
