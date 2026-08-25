import { useCallback, useEffect, useState } from 'react';
import type { Company } from '@/types';
import { companyService } from '../services';

/**
 * The single configured company (this app is single-tenant per
 * src/types/company.ts's doc comment — there is no multi-company
 * switching yet). Used anywhere a document needs to render the issuing
 * entity's real name/VAT/registration details instead of a placeholder —
 * e.g. tax invoices (SA_ACCOUNTING_MASTER_SPEC.md §13). `error`/`refetch`
 * added for the Companies page (M2, docs/V0_DASHBOARD_INTEGRATION.md) —
 * every existing caller only destructured `company`/`loading`, so this is
 * additive.
 */
export function useCompany() {
  const [company, setCompany] = useState<Company | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    companyService
      .getCompanies()
      .then((companies) => {
        if (!cancelled) setCompany(companies[0]);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Failed to load company'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  return { company, loading, error, refetch };
}
