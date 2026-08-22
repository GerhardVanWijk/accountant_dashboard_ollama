import { useCallback, useEffect, useState } from 'react';
import { taxRegisterService, type TaxRegisterRow } from '../services';

export interface UseTaxRegisterResult {
  rows: TaxRegisterRow[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/** Component -> Hook -> Service chain for the Tax Register report (read-only, no repository of its own). */
export function useTaxRegister(asOfDate: string): UseTaxRegisterResult {
  const [rows, setRows] = useState<TaxRegisterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await taxRegisterService.getTaxRegister(asOfDate));
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to compute the tax register'));
    } finally {
      setLoading(false);
    }
  }, [asOfDate]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { rows, loading, error, refetch };
}
