import { useCallback, useEffect, useState } from 'react';
import type { FinancialYear } from '@/types';
import { financialYearService } from '@/features/accounting/services';
import { getCashFlowStatement, type CashFlowStatement } from '../services';

export interface UseCashFlowStatementResult {
  financialYears: FinancialYear[];
  statement: CashFlowStatement | undefined;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Component -> Hook -> Service chain (docs/ARCHITECTURE.md) for the Cash
 * Flow Statement. Loads the company's FinancialYears (for the period
 * picker, mirroring the Income Tax page's pattern) and computes the
 * Statement of Cash Flows for whichever one is selected.
 */
export function useCashFlowStatement(selectedFinancialYearId: string | null): UseCashFlowStatementResult {
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [statement, setStatement] = useState<CashFlowStatement | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const years = await financialYearService.getFinancialYears();
      setFinancialYears(years);

      const sorted = [...years].sort((a, b) => b.endDate.localeCompare(a.endDate));
      const activeId = selectedFinancialYearId ?? sorted[0]?.id ?? null;
      const activeYear = sorted.find((y) => y.id === activeId);

      if (activeYear) {
        const computed = await getCashFlowStatement({ start: activeYear.startDate, end: activeYear.endDate });
        setStatement(computed);
      } else {
        setStatement(undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load the cash flow statement'));
    } finally {
      setLoading(false);
    }
  }, [selectedFinancialYearId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { financialYears, statement, loading, error, refetch };
}
