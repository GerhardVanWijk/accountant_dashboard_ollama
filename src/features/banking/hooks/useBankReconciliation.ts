import { useCallback, useEffect, useState } from 'react';
import type { ID } from '@/types';
import { SYSTEM_USER_ID } from '@/features/accounting/services';
import { bankReconciliationService } from '../services';
import type { ReconciliationSummary } from '../services';
import type { BankReconciliation } from '../types';

/**
 * Drives the reconciliation workspace: recomputes the live summary
 * whenever the statement date/balance/cleared-item selection changes, and
 * exposes finalize + history. `finalize` throws if the service rejects a
 * non-zero-variance attempt — the UI should surface that error, never
 * suppress it.
 */
export function useBankReconciliation(bankAccountId: ID | undefined) {
  const [statementDate, setStatementDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [statementBalance, setStatementBalance] = useState<number>(0);
  const [clearedIds, setClearedIds] = useState<Set<ID>>(new Set());
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const [history, setHistory] = useState<BankReconciliation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refreshSummary = useCallback(async () => {
    if (!bankAccountId) {
      setSummary(null);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const result = await bankReconciliationService.computeSummary(
        bankAccountId,
        new Date(statementDate).toISOString(),
        statementBalance,
        Array.from(clearedIds),
      );
      setSummary(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [bankAccountId, statementDate, statementBalance, clearedIds]);

  const refreshHistory = useCallback(async () => {
    if (!bankAccountId) {
      setHistory([]);
      return;
    }
    const result = await bankReconciliationService.getHistory(bankAccountId);
    setHistory(result);
  }, [bankAccountId]);

  useEffect(() => {
    refreshSummary();
  }, [refreshSummary]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  function toggleCleared(id: ID) {
    setClearedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function finalize(notes?: string): Promise<BankReconciliation> {
    if (!bankAccountId) throw new Error('Select a bank account first.');
    try {
      setIsFinalizing(true);
      setError(null);
      const record = await bankReconciliationService.finalizeReconciliation(
        bankAccountId,
        new Date(statementDate).toISOString(),
        statementBalance,
        Array.from(clearedIds),
        SYSTEM_USER_ID,
        notes,
      );
      setClearedIds(new Set());
      await Promise.all([refreshSummary(), refreshHistory()]);
      return record;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsFinalizing(false);
    }
  }

  return {
    statementDate,
    setStatementDate,
    statementBalance,
    setStatementBalance,
    clearedIds,
    toggleCleared,
    summary,
    history,
    isLoading,
    isFinalizing,
    error,
    finalize,
    refetch: refreshSummary,
    refetchHistory: refreshHistory,
  };
}
