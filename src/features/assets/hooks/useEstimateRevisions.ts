import { useCallback, useEffect, useState } from 'react';
import type { EstimateRevision } from '@/types';
import { estimateRevisionRepository } from '../repositories/instances';

export interface UseEstimateRevisionsResult {
  revisions: EstimateRevision[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Every effective-dated change-in-estimate ever recorded (append-only, migration
 * 0079) — the authoritative history shown in the Revise Estimate dialog and the
 * asset detail workspace. Filter by `assetId` in the component.
 */
export function useEstimateRevisions(): UseEstimateRevisionsResult {
  const [revisions, setRevisions] = useState<EstimateRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRevisions(await estimateRevisionRepository.getAll());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load estimate revisions'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { revisions, loading, error, refetch };
}
