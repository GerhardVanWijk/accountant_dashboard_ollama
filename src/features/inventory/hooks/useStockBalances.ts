import { useCallback, useEffect, useState } from 'react';
import type { StockBalance } from '@/types';
import { stockBalanceService } from '../services/stockBalanceService';

export interface UseStockBalancesResult {
  balances: StockBalance[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Component → Hook → Service chain for the per-(product, warehouse) balance
 * cache (`stock_balances`, fork D; migration 0026). Read-only — every write
 * to a balance goes through the atomic posting engine, never a component.
 */
export function useStockBalances(): UseStockBalancesResult {
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBalances(await stockBalanceService.getBalances());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load stock balances'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { balances, loading, error, refetch };
}
