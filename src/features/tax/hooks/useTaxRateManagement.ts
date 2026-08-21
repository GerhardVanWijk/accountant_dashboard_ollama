import { useCallback, useEffect, useState } from 'react';
import type { TaxRate } from '@/types';
import { SYSTEM_USER_ID } from '@/features/accounting/services';
import { taxRateService, type CreateTaxRateDTO, type SupersedeTaxRateInput } from '../services';

/**
 * Drives the Tax Rates settings page: every tax rate ever created
 * (including superseded historical versions — the page shows full
 * history per code, per docs/SA_ACCOUNTING_MASTER_SPEC.md §82's
 * versioning requirement), plus create/supersede/deactivate actions.
 * `SYSTEM_USER_ID` is the same fallback every other reason-required
 * action in this codebase uses pending a real auth session (see
 * useBankReconciliation.ts) — not invented here.
 */
export function useTaxRateManagement() {
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    taxRateService
      .getTaxRates()
      .then((rates) => {
        if (!cancelled) setTaxRates(rates);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Failed to load tax rates'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  async function createTaxRate(data: CreateTaxRateDTO): Promise<TaxRate> {
    const created = await taxRateService.createTaxRate(data);
    refetch();
    return created;
  }

  async function supersede(code: string, input: SupersedeTaxRateInput, reason: string): Promise<TaxRate> {
    const superseded = await taxRateService.supersede(code, input, SYSTEM_USER_ID, reason);
    refetch();
    return superseded;
  }

  async function deactivate(id: string): Promise<TaxRate> {
    const updated = await taxRateService.deactivate(id);
    refetch();
    return updated;
  }

  return { taxRates, loading, error, refetch, createTaxRate, supersede, deactivate };
}
