import { useCallback, useEffect, useState } from 'react';
import { stockOnOrderService } from '../services/stockOnOrderService';

export interface UseStockOnOrderResult {
  /** Keyed by `commitmentKey(productId, warehouseId)` → quantity inbound on open POs. */
  onOrder: Map<string, number>;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Component → Hook → Service chain for the derived quantity-on-order map.
 * Read-only — recomputed from open purchase-order lines, never stored, never
 * written. Mirrors `useStockCommitments`.
 */
export function useStockOnOrder(): UseStockOnOrderResult {
  const [onOrder, setOnOrder] = useState<Map<string, number>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOnOrder(await stockOnOrderService.getOnOrderMap());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load quantity on order'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { onOrder, loading, error, refetch };
}
