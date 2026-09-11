import { useCallback, useEffect, useState } from 'react';
import type { LeaseAmortizationEntry } from '@/types/lease';
import { leaseAmortizationService, type LeaseAmortizationRunResult, type LeaseAmortizationPreviewRow } from '../services';

export interface UseLeaseAmortizationResult {
  history: LeaseAmortizationEntry[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  runAmortization: (periodEnd: string) => Promise<LeaseAmortizationRunResult>;
  /** Read-only preview of what runAmortization(periodEnd) would post — PART 1.20 of the Leases + Payroll integrity audit. Posts nothing. */
  previewAmortization: (periodEnd: string) => Promise<LeaseAmortizationPreviewRow[]>;
}

/** Component -> Hook -> Service -> Repository chain for the lease amortization ledger. */
export function useLeaseAmortization(): UseLeaseAmortizationResult {
  const [history, setHistory] = useState<LeaseAmortizationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHistory(await leaseAmortizationService.getAmortizationHistory());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load lease amortization history'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const runAmortization = useCallback(
    async (periodEnd: string) => {
      const result = await leaseAmortizationService.runAmortization(periodEnd);
      await refetch();
      return result;
    },
    [refetch],
  );

  const previewAmortization = useCallback((periodEnd: string) => leaseAmortizationService.previewAmortization(periodEnd), []);

  return { history, loading, error, refetch, runAmortization, previewAmortization };
}
