import { useEffect, useState } from 'react';
import type { DeferredTaxComputation } from '@/types';
import type { DeferredTaxReconciliation } from '../services';
import { reconcileDeferredTaxToGl } from '../services';
import { journalEntryService, accountMappingService } from '@/features/accounting/services';

export interface UseDeferredTaxReconciliationResult {
  reconciliation: DeferredTaxReconciliation | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Deferred Tax Schedule <-> GL reconciliation for the ONE posted
 * computation currently selected on the page (Tax & Compliance integrity
 * audit continuation, 2026-09-12, §5). Deliberately does nothing for a
 * draft — see reconcileDeferredTaxToGl()'s doc comment on never falsely
 * marking an unposted schedule reconciled.
 */
export function useDeferredTaxReconciliation(computation: DeferredTaxComputation | undefined): UseDeferredTaxReconciliationResult {
  const [reconciliation, setReconciliation] = useState<DeferredTaxReconciliation | null>(null);
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

    reconcileDeferredTaxToGl(journalEntryService, accountMappingService, computation)
      .then((recon) => {
        if (!cancelled) setReconciliation(recon);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Failed to reconcile Deferred Tax'));
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
