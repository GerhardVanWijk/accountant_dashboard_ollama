import { useCallback, useEffect, useState } from 'react';
import type { Product } from '@/types';
import { stockService } from '../services/stockService';

export interface UseStockAlertsResult {
  lowStock: Product[];
  outOfStock: Product[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Component -> Hook -> Service chain for low-stock/out-of-stock alerts
 * (docs/ARCHITECTURE.md). Backs LowStockAlertWidget
 * (src/features/inventory/components/LowStockAlertWidget.tsx); the
 * underlying stockService.getLowStockItems()/getOutOfStockItems() are also
 * exported directly for other features (e.g. the dashboard) to call.
 */
export function useStockAlerts(): UseStockAlertsResult {
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [outOfStock, setOutOfStock] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [low, out] = await Promise.all([stockService.getLowStockItems(), stockService.getOutOfStockItems()]);
      setLowStock(low);
      setOutOfStock(out);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load stock alerts'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { lowStock, outOfStock, loading, error, refetch };
}
