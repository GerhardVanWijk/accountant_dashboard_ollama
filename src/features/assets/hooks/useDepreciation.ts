import { useCallback, useEffect, useState } from 'react';
import type { DepreciationEntry } from '@/types';
import { depreciationService, type DepreciationRunResult } from '../services';

export interface UseDepreciationResult {
  history: DepreciationEntry[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  runDepreciation: (periodEnd: string) => Promise<DepreciationRunResult>;
}

/** Component -> Hook -> Service -> Repository chain for the depreciation ledger. */
export function useDepreciation(): UseDepreciationResult {
  const [history, setHistory] = useState<DepreciationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHistory(await depreciationService.getDepreciationHistory());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load depreciation history'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const runDepreciation = useCallback(
    async (periodEnd: string) => {
      const result = await depreciationService.runDepreciation(periodEnd);
      await refetch();
      return result;
    },
    [refetch],
  );

  return { history, loading, error, refetch, runDepreciation };
}
