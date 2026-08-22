import { useCallback, useEffect, useState } from 'react';
import type { CapitalGainsPeriodReport, SALegalEntityType } from '@/types';
import { capitalGainsService } from '../services';

export interface UseCapitalGainsReportResult {
  report: CapitalGainsPeriodReport | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  setSellingCosts: (disposalId: string, sellingCosts: number) => Promise<void>;
}

/**
 * Drives the Capital Gains Tax page: computes the period's TAX
 * reconciliation over the real disposal ledger (§55). `legalEntityType`
 * is undefined while the company record is still loading — the hook
 * simply stays in a loading state until it's available.
 */
export function useCapitalGainsReport(
  periodStart: Date,
  periodEnd: Date,
  legalEntityType: SALegalEntityType | undefined,
): UseCapitalGainsReportResult {
  const [report, setReport] = useState<CapitalGainsPeriodReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!legalEntityType) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    capitalGainsService
      .getPeriodReport(periodStart, periodEnd, legalEntityType)
      .then((computed) => {
        if (!cancelled) setReport(computed);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Failed to compute the Capital Gains Tax report'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodStart.getTime(), periodEnd.getTime(), legalEntityType, reloadToken]);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  const setSellingCosts = useCallback(
    async (disposalId: string, sellingCosts: number) => {
      await capitalGainsService.setSellingCosts(disposalId, sellingCosts);
      refetch();
    },
    [refetch],
  );

  return { report, loading, error, refetch, setSellingCosts };
}
