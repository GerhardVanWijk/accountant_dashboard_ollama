import { useCallback, useEffect, useState } from 'react';
import type { AssetDisposal } from '@/types';
import { assetDisposalService, type DisposeAssetInput } from '../services';

export interface UseAssetDisposalsResult {
  disposals: AssetDisposal[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  disposeAsset: (input: DisposeAssetInput) => Promise<AssetDisposal>;
}

/** Component -> Hook -> Service -> Repository chain for the disposal ledger. */
export function useAssetDisposals(): UseAssetDisposalsResult {
  const [disposals, setDisposals] = useState<AssetDisposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDisposals(await assetDisposalService.getDisposals());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load asset disposals'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const disposeAsset = useCallback(
    async (input: DisposeAssetInput) => {
      const disposal = await assetDisposalService.disposeAsset(input);
      await refetch();
      return disposal;
    },
    [refetch],
  );

  return { disposals, loading, error, refetch, disposeAsset };
}
