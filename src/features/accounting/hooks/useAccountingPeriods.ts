import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AccountingPeriod, ID } from '@/types';
import { accountingPeriodService } from '../services';

export interface UseAccountingPeriodsResult {
  periods: AccountingPeriod[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  closePeriod: (periodId: ID, userId: ID) => Promise<AccountingPeriod>;
  lockPeriod: (periodId: ID, userId: ID) => Promise<AccountingPeriod>;
  reopenPeriod: (periodId: ID, userId: ID, reason: string) => Promise<AccountingPeriod>;
}

/**
 * Component -> useAccountingPeriods -> accountingPeriodService ->
 * SupabaseAccountingPeriodRepository. Every transition throws on failure
 * (missing reason on reopen, unknown period) — callers surface
 * `err.message` rather than re-deriving that rule here. First hook onto
 * AccountingPeriodService — M0-M2 had no Financial Periods UI yet.
 */
export function useAccountingPeriods(): UseAccountingPeriodsResult {
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await accountingPeriodService.getPeriods();
      setPeriods(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load accounting periods'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const closePeriod = useCallback(
    async (periodId: ID, userId: ID) => {
      const updated = await accountingPeriodService.closePeriod(periodId, userId);
      await load();
      return updated;
    },
    [load],
  );

  const lockPeriod = useCallback(
    async (periodId: ID, userId: ID) => {
      const updated = await accountingPeriodService.lockPeriod(periodId, userId);
      await load();
      return updated;
    },
    [load],
  );

  const reopenPeriod = useCallback(
    async (periodId: ID, userId: ID, reason: string) => {
      const updated = await accountingPeriodService.reopenPeriod(periodId, userId, reason);
      await load();
      return updated;
    },
    [load],
  );

  return useMemo(
    () => ({ periods, loading, error, refetch: load, closePeriod, lockPeriod, reopenPeriod }),
    [periods, loading, error, load, closePeriod, lockPeriod, reopenPeriod],
  );
}
