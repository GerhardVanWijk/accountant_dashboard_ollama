import { useCallback, useEffect, useState } from 'react';
import type { Account, LeaseContract } from '@/types';
import { journalEntryService } from '@/features/accounting/services';
import { reconcileLeaseRegisterToGl, type LeaseRegisterReconciliation } from '../services';

export interface UseLeaseRegisterHealthResult {
  reconciliation: LeaseRegisterReconciliation | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Read-side health of the Lease Register: register↔GL reconciliation
 * (SA_ACCOUNTING_MASTER_SPEC.md §32/§47, PART 1.14 of the Leases + Payroll
 * integrity audit). Mirrors useAssetRegisterHealth.ts exactly — pure
 * derivation over data the caller already holds, the only network hit is
 * the GL account ledgers for the three lease accounts.
 */
export function useLeaseRegisterHealth(leases: LeaseContract[], accounts: Account[], ready: boolean): UseLeaseRegisterHealthResult {
  const [reconciliation, setReconciliation] = useState<LeaseRegisterReconciliation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      setReconciliation(await reconcileLeaseRegisterToGl(journalEntryService, leases, accounts));
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to check the lease register'));
    } finally {
      setLoading(false);
    }
  }, [ready, leases, accounts]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { reconciliation, loading, error, refetch };
}
