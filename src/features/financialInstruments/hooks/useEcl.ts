import { useCallback, useEffect, useState } from 'react';
import type { Company, EclBucketLine, EclComputation, FinancialYear, ID } from '@/types';
import { financialYearService } from '@/features/accounting/services';
import { companyService } from '@/features/admin/services';
import { eclComputationService } from '../services';

export interface UseEclResult {
  financialYears: FinancialYear[];
  company: Company | undefined;
  computations: EclComputation[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createComputation: (financialYearId: ID) => Promise<EclComputation>;
  updateBuckets: (id: ID, buckets: EclBucketLine[]) => Promise<EclComputation>;
  deleteComputation: (id: ID) => Promise<void>;
  postComputation: (id: ID) => Promise<EclComputation>;
}

/**
 * Component -> Hook -> Service -> Repository chain for the Financial
 * Instruments (ECL) feature (docs/ARCHITECTURE.md), mirrors useDeferredTax.ts
 * exactly.
 */
export function useEcl(): UseEclResult {
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [company, setCompany] = useState<Company | undefined>(undefined);
  const [computations, setComputations] = useState<EclComputation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [years, companies, comps] = await Promise.all([
        financialYearService.getFinancialYears(),
        companyService.getCompanies(),
        eclComputationService.getComputations(),
      ]);
      setFinancialYears(years);
      setCompany(companies[0]);
      setComputations(comps);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load expected credit loss data'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createComputation = useCallback(
    async (financialYearId: ID) => {
      const created = await eclComputationService.createComputation(financialYearId);
      await refetch();
      return created;
    },
    [refetch],
  );

  const updateBuckets = useCallback(
    async (id: ID, buckets: EclBucketLine[]) => {
      const updated = await eclComputationService.updateBuckets(id, buckets);
      await refetch();
      return updated;
    },
    [refetch],
  );

  const deleteComputation = useCallback(
    async (id: ID) => {
      await eclComputationService.deleteComputation(id);
      await refetch();
    },
    [refetch],
  );

  const postComputation = useCallback(
    async (id: ID) => {
      const posted = await eclComputationService.postComputation(id);
      await refetch();
      return posted;
    },
    [refetch],
  );

  return { financialYears, company, computations, loading, error, refetch, createComputation, updateBuckets, deleteComputation, postComputation };
}
