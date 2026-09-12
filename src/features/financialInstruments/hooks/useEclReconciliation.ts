import { useEffect, useState } from 'react';
import type { EclComputation } from '@/types';
import type { EclReconciliation } from '../services';
import { reconcileEclToGl } from '../services';
import { journalEntryService, accountMappingService } from '@/features/accounting/services';

export interface UseEclReconciliationResult {
  reconciliation: EclReconciliation | null;
  loading: boolean;
  error: Error | null;
}

/**
 * ECL Allowance Schedule <-> GL reconciliation for the ONE posted
 * computation currently selected on the page (Tax & Compliance integrity
 * audit continuation, 2026-09-12, §7). Deliberately does nothing for a
 * draft — see reconcileEclToGl()'s doc comment on never falsely marking
 * an unposted schedule reconciled.
 */
export function useEclReconciliation(computation: EclComputation | undefined): UseEclReconciliationResult {
  const [reconciliation, setReconciliation] = useState<EclReconciliation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!computation || computation.status !== 'posted') {
      setReconciliation(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    reconcileEclToGl(journalEntryService, accountMappingService, computation)
      .then((recon) => {
        if (!cancelled) setReconciliation(recon);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Failed to reconcile Expected Credit Losses'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [computation]);

  return { reconciliation, loading, error };
}
