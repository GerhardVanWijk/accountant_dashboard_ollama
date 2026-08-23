import { useCallback, useEffect, useState } from 'react';
import type { Company, FinancialYear, ReportingStandardVersion } from '@/types';
import { SYSTEM_USER_ID, financialYearService } from '@/features/accounting/services';
import { companyService } from '@/features/admin/services';
import { reportingStandardService, type CreateReportingStandardVersionDTO } from '../services';

/** Drives the Reporting Standards page: the company, its FinancialYears, every tracked ReportingStandardVersion, and which version applies to the open financial year for both trackable standards (full_ifrs, ifrs_for_smes) at the company's current early-adoption election. */
export function useReportingStandards() {
  const [company, setCompany] = useState<Company | undefined>(undefined);
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [versions, setVersions] = useState<ReportingStandardVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([companyService.getCompanies(), financialYearService.getFinancialYears(), reportingStandardService.getVersions()])
      .then(([companies, years, versionList]) => {
        if (cancelled) return;
        setCompany(companies[0]);
        setFinancialYears(years);
        setVersions(versionList);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Failed to load reporting standard data'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  const supersede = useCallback(
    async (data: CreateReportingStandardVersionDTO, reason: string) => {
      const created = await reportingStandardService.supersede(data, SYSTEM_USER_ID, reason);
      refetch();
      return created;
    },
    [refetch],
  );

  return { company, financialYears, versions, loading, error, refetch, supersede };
}
