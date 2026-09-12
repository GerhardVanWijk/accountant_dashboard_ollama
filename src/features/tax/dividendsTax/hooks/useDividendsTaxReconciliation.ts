import { useEffect, useState } from 'react';
import type { DividendsTaxReconciliation } from '../services';
import { reconcileDividendsTaxControlAccounts } from '../services';
import { dividendDeclarationService } from '../services';
import { journalEntryService, accountMappingService } from '@/features/accounting/services';

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

export interface UseDividendsTaxReconciliationResult {
  reconciliation: DividendsTaxReconciliation | null;
  loading: boolean;
  error: Error | null;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Current-month Dividends Tax Register <-> GL reconciliation for the
 * Dividends Tax page and the Compliance Dashboard (Tax & Compliance
 * integrity audit continuation, 2026-09-12, §3) — same "current month"
 * window `useComplianceDashboard.ts` already uses for VAT/EMP201, so every
 * reconciliation card on the dashboard reads the same period.
 */
export function useDividendsTaxReconciliation(): UseDividendsTaxReconciliationResult {
  const [reconciliation, setReconciliation] = useState<DividendsTaxReconciliation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const now = new Date();
  const periodStart = startOfMonth(now);
  const periodEnd = endOfMonth(now);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    dividendDeclarationService
      .getDeclarations()
      .then((declarations) => reconcileDividendsTaxControlAccounts(journalEntryService, accountMappingService, periodStart, periodEnd, declarations))
      .then((recon) => {
        if (!cancelled) setReconciliation(recon);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Failed to reconcile Dividends Tax'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- periodStart/periodEnd are derived fresh from `now` each render on purpose (always "this month"); re-deriving them as deps would refetch every render.
  }, []);

  return { reconciliation, loading, error, periodStart, periodEnd };
}
