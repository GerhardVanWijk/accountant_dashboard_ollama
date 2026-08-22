import { useCallback, useEffect, useState } from 'react';
import type { Account, FinancialYear, JournalEntry } from '@/types';
import { accountService, financialYearService, journalEntryService } from '@/features/accounting/services';

export interface UseFinancialStatementsDataResult {
  accounts: Account[];
  entries: JournalEntry[];
  financialYears: FinancialYear[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Component -> Hook -> Service chain (docs/ARCHITECTURE.md) shared by the
 * Income Statement and Balance Sheet pages — both are pure read-only
 * reports over the same three real data sources (Chart of Accounts, posted
 * JournalEntry lines, FinancialYears), so both pages fetch through this one
 * hook rather than duplicating the Promise.all() wiring.
 */
export function useFinancialStatementsData(): UseFinancialStatementsDataResult {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accountList, entryList, financialYearList] = await Promise.all([
        accountService.getAccounts(),
        journalEntryService.getEntries(),
        financialYearService.getFinancialYears(),
      ]);
      setAccounts(accountList);
      setEntries(entryList);
      setFinancialYears(financialYearList);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load financial statement data'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { accounts, entries, financialYears, loading, error, refetch };
}
