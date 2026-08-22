import { useCallback, useEffect, useState } from 'react';
import type { Company, FinancialYear, ID, TaxAdjustment, TaxComputation } from '@/types';
import { financialYearService } from '@/features/accounting/services';
import { companyService } from '@/features/admin/services';
import { taxComputationService } from '../services';

export interface UseIncomeTaxResult {
  financialYears: FinancialYear[];
  company: Company | undefined;
  computations: TaxComputation[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createComputation: (financialYearId: ID) => Promise<TaxComputation>;
  updateAdjustments: (id: ID, adjustments: TaxAdjustment[]) => Promise<TaxComputation>;
  deleteComputation: (id: ID) => Promise<void>;
  postComputation: (id: ID) => Promise<TaxComputation>;
  setSbcEligibility: (isEligible: boolean, userId: ID, reason: string) => Promise<Company>;
}

/**
 * Component -> Hook -> Service -> Repository chain for the Income Tax
 * feature (docs/ARCHITECTURE.md) — the company record, its financial
 * years, and every TaxComputation across them.
 */
export function useIncomeTax(): UseIncomeTaxResult {
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [company, setCompany] = useState<Company | undefined>(undefined);
  const [computations, setComputations] = useState<TaxComputation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [years, companies, comps] = await Promise.all([
        financialYearService.getFinancialYears(),
        companyService.getCompanies(),
        taxComputationService.getComputations(),
      ]);
      setFinancialYears(years);
      setCompany(companies[0]);
      setComputations(comps);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load income tax data'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createComputation = useCallback(
    async (financialYearId: ID) => {
      const created = await taxComputationService.createComputation(financialYearId);
      await refetch();
      return created;
    },
    [refetch],
  );

  const updateAdjustments = useCallback(
    async (id: ID, adjustments: TaxAdjustment[]) => {
      const updated = await taxComputationService.updateAdjustments(id, adjustments);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const deleteComputation = useCallback(
    async (id: ID) => {
      await taxComputationService.deleteComputation(id);
      await refetch();
    },
    [refetch],
  );

  const postComputation = useCallback(
    async (id: ID) => {
      const posted = await taxComputationService.postComputation(id);
      await refetch();
      return posted;
    },
    [refetch],
  );

  const setSbcEligibility = useCallback(
    async (isEligible: boolean, userId: ID, reason: string) => {
      if (!company) {
        throw new Error('No company loaded yet.');
      }
      const updated = await companyService.setSbcEligibility(company.id, isEligible, userId, reason);
      await refetch();
      return updated;
    },
    [company, refetch],
  );

  return {
    financialYears,
    company,
    computations,
    loading,
    error,
    refetch,
    createComputation,
    updateAdjustments,
    deleteComputation,
    postComputation,
    setSbcEligibility,
  };
}
