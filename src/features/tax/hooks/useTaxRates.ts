import { useEffect, useState } from 'react';
import type { TaxRate } from '@/types';
import { taxRateService } from '../services';

/**
 * The currently-effective version of every active tax code — what a
 * "pick a tax rate" select/dropdown for a NEW transaction should offer.
 * Superseded historical versions stay queryable via
 * TaxRateService.getRateHistory()/getEffectiveRate(), just not offered
 * here.
 */
export function useTaxRates() {
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    taxRateService
      .getCurrentlyEffectiveRates()
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
  }, []);

  return { taxRates, loading, error };
}

/**
 * Every tax rate ever created, including superseded historical versions —
 * for resolving an EXISTING record's `taxRateId` to a display name (a
 * Product/document created years ago may reference a version that's no
 * longer offered by useTaxRates()). Never use this to populate a "pick a
 * rate" select for a new transaction — use useTaxRates() for that.
 */
export function useAllTaxRates() {
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    taxRateService
      .getTaxRates()
      .then((rates) => {
        if (!cancelled) setTaxRates(rates);
      })
      .catch((err: unknown) => {
        // Never leave the caller with a silent empty list — an unresolved
        // load must be distinguishable from "this record genuinely has no
        // rate" (see getTaxRateLabel's `pending` handling).
        if (!cancelled) setError(err instanceof Error ? err : new Error('Failed to load tax rates'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { taxRates, loading, error };
}
