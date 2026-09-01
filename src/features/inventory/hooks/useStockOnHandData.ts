import { useMemo } from 'react';
import { buildStockOnHandRows, type StockOnHandRow } from '../reports/buildStockOnHandRows';
import { useProducts } from './useProducts';
import { useStockBalances } from './useStockBalances';
import { useProductCategories } from './useProductCategories';
import { useWarehouses } from './useWarehouses';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';

export interface UseStockOnHandDataResult {
  rows: StockOnHandRow[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * The one combined data source every STOCK/ANALYSIS report (Stock on Hand,
 * Valuation, Low Stock, Out of Stock, Warehouse/Category/Supplier/Margin
 * Analysis, Slow-Moving) is built from — fetches products, stock balances,
 * categories, suppliers and warehouses in parallel and hands back the
 * authoritative `StockOnHandRow[]` (`buildStockOnHandRows`). One fetch, one
 * loading/error state, instead of five report pages each re-wiring the same
 * five hooks (spec §24 — avoid N+1/duplicated service calls).
 */
export function useStockOnHandData(): UseStockOnHandDataResult {
  const products = useProducts();
  const balances = useStockBalances();
  const categories = useProductCategories();
  const suppliers = useSuppliers();
  const warehouses = useWarehouses();

  const loading = products.loading || balances.loading || categories.loading || suppliers.loading || warehouses.loading;
  const error = products.error ?? balances.error ?? categories.error ?? suppliers.error ?? warehouses.error;

  const rows = useMemo(
    () => buildStockOnHandRows(products.products, balances.balances, categories.categories, suppliers.suppliers, warehouses.warehouses),
    [products.products, balances.balances, categories.categories, suppliers.suppliers, warehouses.warehouses],
  );

  const refetch = async () => {
    await Promise.all([products.refetch(), balances.refetch(), categories.refetch(), suppliers.refetch(), warehouses.refetch()]);
  };

  return { rows, loading, error, refetch };
}
