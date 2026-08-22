import { useCallback, useEffect, useState } from 'react';
import type { Company, FinancialYear, ID } from '@/types';
import type { ProvisionalPaymentSlotName, ProvisionalTaxPeriod, ProvisionalTaxReconciliation } from '@/types/provisionalTax';
import { financialYearService } from '@/features/accounting/services';
import { companyService } from '@/features/admin/services';
import { provisionalTaxService } from '../services';

export interface UseProvisionalTaxResult {
  financialYears: FinancialYear[];
  company: Company | undefined;
  periods: ProvisionalTaxPeriod[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  getOrCreatePeriod: (financialYearId: ID) => Promise<ProvisionalTaxPeriod>;
  recordEstimate: (periodId: ID, slot: ProvisionalPaymentSlotName, estimatedTaxableIncome: number) => Promise<ProvisionalTaxPeriod>;
  payProvisionalTax: (periodId: ID, slot: ProvisionalPaymentSlotName, amountPaid: number, date?: string) => Promise<ProvisionalTaxPeriod>;
  getReconciliation: (financialYearId: ID) => Promise<ProvisionalTaxReconciliation | undefined>;
}

/**
 * Component -> Hook -> Service -> Repository chain for the Provisional Tax
 * feature (docs/ARCHITECTURE.md) — the company record, its financial years,
 * and every ProvisionalTaxPeriod across them. Mirrors useIncomeTax.ts.
 */
export function useProvisionalTax(): UseProvisionalTaxResult {
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [company, setCompany] = useState<Company | undefined>(undefined);
  const [periods, setPeriods] = useState<ProvisionalTaxPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [years, companies, allPeriods] = await Promise.all([
        financialYearService.getFinancialYears(),
        companyService.getCompanies(),
        provisionalTaxService.getPeriods(),
      ]);
      setFinancialYears(years);
      setCompany(companies[0]);
      setPeriods(allPeriods);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load provisional tax data'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const getOrCreatePeriod = useCallback(
    async (financialYearId: ID) => {
      const period = await provisionalTaxService.getOrCreatePeriod(financialYearId);
      await refetch();
      return period;
    },
    [refetch],
  );

  const recordEstimate = useCallback(
    async (periodId: ID, slot: ProvisionalPaymentSlotName, estimatedTaxableIncome: number) => {
      const updated = await provisionalTaxService.recordEstimate(periodId, slot, estimatedTaxableIncome);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const payProvisionalTax = useCallback(
    async (periodId: ID, slot: ProvisionalPaymentSlotName, amountPaid: number, date?: string) => {
      const updated = await provisionalTaxService.payProvisionalTax(periodId, slot, amountPaid, date);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const getReconciliation = useCallback(
    (financialYearId: ID) => provisionalTaxService.getReconciliation(financialYearId),
    [],
  );

  return {
    financialYears,
    company,
    periods,
    loading,
    error,
    refetch,
    getOrCreatePeriod,
    recordEstimate,
    payProvisionalTax,
    getReconciliation,
  };
}
