import { useCallback, useEffect, useState } from 'react';
import type { Account, AssetDisposal, DepreciationEntry, EstimateRevision, FixedAsset } from '@/types';
import { journalEntryService } from '@/features/accounting/services';
import {
  auditAssetRegisterIntegrity,
  reconcileAssetRegisterToGl,
  type AssetIntegrityReport,
  type AssetRegisterReconciliation,
} from '../services';

export interface UseAssetRegisterHealthResult {
  reconciliation: AssetRegisterReconciliation | null;
  integrity: AssetIntegrityReport | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Read-side health of the Fixed Asset Register: register↔GL reconciliation
 * plus the integrity sweep. Pure derivation over data the caller already
 * holds — the only network hit is the GL account ledgers for the
 * reconciliation.
 */
export function useAssetRegisterHealth(
  assets: FixedAsset[],
  depreciationEntries: DepreciationEntry[],
  disposals: AssetDisposal[],
  accounts: Account[],
  ready: boolean,
  /** Every estimate revision ever recorded (Review 4 Item K's estimate_snapshot_mismatch check) — optional so callers that don't have it yet still work. */
  estimateRevisions: EstimateRevision[] = [],
): UseAssetRegisterHealthResult {
  const [reconciliation, setReconciliation] = useState<AssetRegisterReconciliation | null>(null);
  const [integrity, setIntegrity] = useState<AssetIntegrityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const recon = await reconcileAssetRegisterToGl(journalEntryService, assets, accounts);
      setReconciliation(recon);
      setIntegrity(auditAssetRegisterIntegrity({ assets, depreciationEntries, disposals, accounts, estimateRevisions }));
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to check the asset register'));
    } finally {
      setLoading(false);
    }
  }, [ready, assets, depreciationEntries, disposals, accounts, estimateRevisions]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { reconciliation, integrity, loading, error, refetch };
}
