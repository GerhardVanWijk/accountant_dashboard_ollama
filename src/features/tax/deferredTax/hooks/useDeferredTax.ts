import { useCallback, useEffect, useState } from 'react';
import type { Company, DeferredTaxComputation, DeferredTaxTemporaryDifference, FinancialYear, ID } from '@/types';
import { financialYearService } from '@/features/accounting/services';
import { companyService } from '@/features/admin/services';
import { deferredTaxComputationService } from '../services';

export interface UseDeferredTaxResult {
  financialYears: FinancialYear[];
  company: Company | undefined;
  computations: DeferredTaxComputation[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createComputation: (financialYearId: ID) => Promise<DeferredTaxComputation>;
  updateItems: (id: ID, items: DeferredTaxTemporaryDifference[]) => Promise<DeferredTaxComputation>;
  deleteComputation: (id: ID) => Promise<void>;
  postComputation: (id: ID) => Promise<DeferredTaxComputation>;
}

/**
 * Component -> Hook -> Service -> Repository chain for the Deferred Tax
 * feature (docs/ARCHITECTURE.md), mirrors useIncomeTax.ts exactly — the
 * company record, its financial years, and every DeferredTaxComputation
 * across them (loaded in full so the UI can locate the prior posted
 * computation for a movement preview via `findMostRecentPostedBefore()`).
 */
export function useDeferredTax(): UseDeferredTaxResult {
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [company, setCompany] = useState<Company | undefined>(undefined);
  const [computations, setComputations] = useState<DeferredTaxComputation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [years, companies, comps] = await Promise.all([
        financialYearService.getFinancialYears(),
        companyService.getCompanies(),
        deferredTaxComputationService.getComputations(),
      ]);
      setFinancialYears(years);
      setCompany(companies[0]);
      setComputations(comps);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load deferred tax data'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createComputation = useCallback(
    async (financialYearId: ID) => {
      const created = await deferredTaxComputationService.createComputation(financialYearId);
      await refetch();
      return created;
    },
    [refetch],
  );

  const updateItems = useCallback(
    async (id: ID, items: DeferredTaxTemporaryDifference[]) => {
      const updated = await deferredTaxComputationService.updateItems(id, items);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const deleteComputation = useCallback(
    async (id: ID) => {
      await deferredTaxComputationService.deleteComputation(id);
      await refetch();
    },
    [refetch],
  );

  const postComputation = useCallback(
    async (id: ID) => {
      const posted = await deferredTaxComputationService.postComputation(id);
      await refetch();
      return posted;
    },
    [refetch],
  );

  return { financialYears, company, computations, loading, error, refetch, createComputation, updateItems, deleteComputation, postComputation };
}
