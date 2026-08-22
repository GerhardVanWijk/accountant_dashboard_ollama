import { useCallback, useEffect, useState } from 'react';
import { computeEmp501Report, payrollRunService, type Emp501Report } from '../services';
import type { SarsTaxYear } from '../utils/sarsTaxYear';

export interface UseEmp501ReportResult {
  report: Emp501Report | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/** Computes the bi-annual EMP501 reconciliation for one SARS tax year from real posted payroll runs. */
export function useEmp501Report(taxYear: SarsTaxYear): UseEmp501ReportResult {
  const [report, setReport] = useState<Emp501Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const runs = await payrollRunService.getPayrollRuns();
      setReport(computeEmp501Report(taxYear, runs));
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to compute the EMP501 reconciliation'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxYear.label]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { report, loading, error, refetch };
}
