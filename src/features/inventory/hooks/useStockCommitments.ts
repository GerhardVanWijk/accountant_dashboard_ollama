import { useCallback, useEffect, useState } from 'react';
import { stockCommitmentService } from '../services/stockCommitmentService';

export interface UseStockCommitmentsResult {
  /** Keyed by `commitmentKey(productId, warehouseId)` → committed quantity. */
  commitments: Map<string, number>;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Component → Hook → Service chain for the derived stock-commitment map
 * (Phase 5A). Read-only — a commitment is recomputed from confirmed Sales
 * Order lines, never stored, never written. Mirrors `useStockBalances`.
 */
export function useStockCommitments(): UseStockCommitmentsResult {
  const [commitments, setCommitments] = useState<Map<string, number>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCommitments(await stockCommitmentService.getCommitmentMap());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load stock commitments'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { commitments, loading, error, refetch };
}
