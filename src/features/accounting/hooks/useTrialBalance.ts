import { useCallback, useEffect, useState } from 'react';
import { journalEntryService, type TrialBalance } from '../services';

export interface UseTrialBalanceResult {
  trialBalance: TrialBalance | undefined;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Component -> useTrialBalance -> journalEntryService.computeTrialBalance().
 * All netting/balancing math happens in the service
 * (docs/LEDGER_ARCHITECTURE.md § Reporting) — this hook only fetches it.
 */
export function useTrialBalance(): UseTrialBalanceResult {
  const [trialBalance, setTrialBalance] = useState<TrialBalance | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTrialBalance(await journalEntryService.computeTrialBalance());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to compute trial balance'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { trialBalance, loading, error, refetch: load };
}
