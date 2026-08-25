import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FinancialYear, ID } from '@/types';
import { financialYearService } from '../services';

export interface UseFinancialYearsResult {
  financialYears: FinancialYear[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  closeFinancialYear: (id: ID, userId: ID) => Promise<FinancialYear>;
}

/**
 * Component -> useFinancialYears -> financialYearService ->
 * SupabaseFinancialYearRepository. There is no create — a financial year
 * is not created from this UI (see FinancialYearService's doc comment);
 * only listing and closing are wired here.
 */
export function useFinancialYears(): UseFinancialYearsResult {
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await financialYearService.getFinancialYears();
      setFinancialYears(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load financial years'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const closeFinancialYear = useCallback(
    async (id: ID, userId: ID) => {
      const updated = await financialYearService.closeFinancialYear(id, userId);
      await load();
      return updated;
    },
    [load],
  );

  return useMemo(
    () => ({ financialYears, loading, error, refetch: load, closeFinancialYear }),
    [financialYears, loading, error, load, closeFinancialYear],
  );
}
