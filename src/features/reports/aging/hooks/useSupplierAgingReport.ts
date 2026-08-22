import { useCallback, useEffect, useState } from 'react';
import { getSupplierAgingReport } from '../services/supplierAgingReportService';
import type { AgingReportRow } from '../types';

export interface UseSupplierAgingReportResult {
  rows: AgingReportRow[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Component -> Hook -> Service chain for the Supplier Aging report.
 * `asOfDate` is an ISO date string (not a `Date` instance) so it's stable
 * across renders — a freshly-constructed `Date` would fail the `useEffect`
 * dependency comparison every render and refetch in a loop.
 */
export function useSupplierAgingReport(asOfDate: string): UseSupplierAgingReportResult {
  const [rows, setRows] = useState<AgingReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await getSupplierAgingReport(new Date(asOfDate)));
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to compute the supplier aging report'));
    } finally {
      setLoading(false);
    }
  }, [asOfDate]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { rows, loading, error, refetch };
}
