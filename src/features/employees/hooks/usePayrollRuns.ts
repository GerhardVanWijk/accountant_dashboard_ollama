import { useCallback, useEffect, useState } from 'react';
import type { PayrollRun } from '@/types';
import { payrollRunService, type PayslipOverrideInput } from '../services';

export interface UsePayrollRunsResult {
  runs: PayrollRun[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createPayrollRun: (payPeriodStart: string, payPeriodEnd: string, payDate: string) => Promise<PayrollRun>;
  updatePayslipOverride: (runId: string, employeeId: string, overrides: PayslipOverrideInput) => Promise<PayrollRun>;
  deletePayrollRun: (id: string) => Promise<void>;
  postPayrollRun: (id: string, contraAccountId: string) => Promise<PayrollRun>;
}

/** Component -> Hook -> Service -> Repository chain for payroll runs (docs/ARCHITECTURE.md). */
export function usePayrollRuns(): UsePayrollRunsResult {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await payrollRunService.getPayrollRuns();
      setRuns([...data].sort((a, b) => b.payDate.localeCompare(a.payDate)));
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load payroll runs'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createPayrollRun = useCallback(
    async (payPeriodStart: string, payPeriodEnd: string, payDate: string) => {
      const created = await payrollRunService.createPayrollRun(payPeriodStart, payPeriodEnd, payDate);
      await refetch();
      return created;
    },
    [refetch],
  );

  const updatePayslipOverride = useCallback(
    async (runId: string, employeeId: string, overrides: PayslipOverrideInput) => {
      const updated = await payrollRunService.updatePayslipOverride(runId, employeeId, overrides);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const deletePayrollRun = useCallback(
    async (id: string) => {
      await payrollRunService.deletePayrollRun(id);
      await refetch();
    },
    [refetch],
  );

  const postPayrollRun = useCallback(
    async (id: string, contraAccountId: string) => {
      const updated = await payrollRunService.postPayrollRun(id, contraAccountId);
      await refetch();
      return updated;
    },
    [refetch],
  );

  return { runs, loading, error, refetch, createPayrollRun, updatePayslipOverride, deletePayrollRun, postPayrollRun };
}
