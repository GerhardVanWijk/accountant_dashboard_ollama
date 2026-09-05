import { useCallback, useEffect, useState } from 'react';
import type { FinancialPlanLine } from '@/types';
import { financialPlanService } from '../services';

export interface UseFinancialPlanLinesResult {
  budgetLines: FinancialPlanLine[];
  forecastLines: FinancialPlanLine[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Loads every Budget and Forecast plan line, every year — a trailing
 * 6/12-month window can span a calendar-year boundary, so year-scoped
 * fetching would silently miss months (see `FinancialPlanService.listAllPlanLines`).
 */
export function useFinancialPlanLines(): UseFinancialPlanLinesResult {
  const [budgetLines, setBudgetLines] = useState<FinancialPlanLine[]>([]);
  const [forecastLines, setForecastLines] = useState<FinancialPlanLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { budgetLines: budget, forecastLines: forecast } = await financialPlanService.listAllPlanLines();
      setBudgetLines(budget);
      setForecastLines(forecast);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load budget/forecast data'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { budgetLines, forecastLines, loading, error, refetch };
}
