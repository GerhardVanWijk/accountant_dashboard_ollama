import { useCallback, useEffect, useState } from 'react';
import { computeEmp201Report, payrollRunService, reconcilePayrollLiabilities, type Emp201Report, type PayrollReconciliation } from '../services';
import { journalEntryService, accountMappingService } from '@/features/accounting/services';

export interface UseEmp201ReportResult {
  report: Emp201Report | null;
  reconciliation: PayrollReconciliation | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/** Computes the EMP201-shaped monthly return + GL reconciliation for [periodStart, periodEnd] from real posted payroll runs — mirrors useVatReport.ts's shape. */
export function useEmp201Report(periodStart: Date, periodEnd: Date): UseEmp201ReportResult {
  const [report, setReport] = useState<Emp201Report | null>(null);
  const [reconciliation, setReconciliation] = useState<PayrollReconciliation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const runs = await payrollRunService.getPayrollRuns();
      const computed = computeEmp201Report(periodStart, periodEnd, runs);
      setReport(computed);
      setReconciliation(await reconcilePayrollLiabilities(journalEntryService, accountMappingService, periodStart, periodEnd, computed));
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to compute the EMP201 return'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodStart.getTime(), periodEnd.getTime()]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { report, reconciliation, loading, error, refetch };
}
