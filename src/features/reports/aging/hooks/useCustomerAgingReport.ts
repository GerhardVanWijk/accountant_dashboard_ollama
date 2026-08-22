import { useCallback, useEffect, useState } from 'react';
import { getCustomerAgingReport } from '../services/customerAgingReportService';
import type { AgingReportRow } from '../types';

export interface UseCustomerAgingReportResult {
  rows: AgingReportRow[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Component -> Hook -> Service chain for the Customer Aging report.
 * `asOfDate` is an ISO date string (not a `Date` instance) so it's stable
 * across renders — a freshly-constructed `Date` would fail the `useEffect`
 * dependency comparison every render and refetch in a loop.
 */
export function useCustomerAgingReport(asOfDate: string): UseCustomerAgingReportResult {
  const [rows, setRows] = useState<AgingReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await getCustomerAgingReport(new Date(asOfDate)));
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to compute the customer aging report'));
    } finally {
      setLoading(false);
    }
  }, [asOfDate]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { rows, loading, error, refetch };
}
