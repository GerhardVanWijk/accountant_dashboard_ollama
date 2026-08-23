import { useCallback, useEffect, useState } from 'react';
import type { Company, FinancialYear, PublicInterestScore, ReportingFramework } from '@/types';
import { SYSTEM_USER_ID } from '@/features/accounting/services';
import { financialYearService } from '@/features/accounting/services';
import { companyService } from '@/features/admin/services';
import { publicInterestScoreService } from '../services';

export interface CalculateScoreFormInput {
  financialYearId: string;
  shareholdersOrMembersCount: number;
  holdsFiduciaryAssetsOverThreshold: boolean;
}

/**
 * Drives the Public Interest Score page: the single seed company (this app
 * is single-tenant, see `useCompany.ts`), its FinancialYears (for the
 * calculation picker), and the full score history (newest first) so a user
 * can see prior calculations, not just the latest. `SYSTEM_USER_ID` is the
 * same fallback every other reason-required action in this codebase uses
 * pending a real auth session (see useTaxRateManagement.ts).
 */
export function usePublicInterestScore() {
  const [company, setCompany] = useState<Company | undefined>(undefined);
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [history, setHistory] = useState<PublicInterestScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    companyService
      .getCompanies()
      .then(async (companies) => {
        const activeCompany = companies[0];
        if (cancelled) return;
        setCompany(activeCompany);
        if (!activeCompany) return;

        const [years, scoreHistory] = await Promise.all([
          financialYearService.getFinancialYears(),
          publicInterestScoreService.getScoreHistory(activeCompany.id),
        ]);
        if (cancelled) return;
        setFinancialYears(years);
        setHistory(scoreHistory);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Failed to load Public Interest Score data'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  const calculateScore = useCallback(
    async (input: CalculateScoreFormInput) => {
      if (!company) throw new Error('No company configured.');
      const created = await publicInterestScoreService.calculateScore({
        companyId: company.id,
        financialYearId: input.financialYearId,
        shareholdersOrMembersCount: input.shareholdersOrMembersCount,
        holdsFiduciaryAssetsOverThreshold: input.holdsFiduciaryAssetsOverThreshold,
        calculatedBy: SYSTEM_USER_ID,
      });
      refetch();
      return created;
    },
    [company, refetch],
  );

  const applyReportingFramework = useCallback(
    async (framework: ReportingFramework, reason: string) => {
      if (!company) throw new Error('No company configured.');
      const updated = await companyService.setReportingFramework(company.id, framework, SYSTEM_USER_ID, reason);
      refetch();
      return updated;
    },
    [company, refetch],
  );

  const latest = history[0];

  return { company, financialYears, history, latest, loading, error, refetch, calculateScore, applyReportingFramework };
}
