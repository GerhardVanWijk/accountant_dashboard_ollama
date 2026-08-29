import { useCallback, useEffect, useState } from 'react';
import type { ID } from '@/types';
import { bankStatementService, bankTransactionService } from '@/features/banking/services';
import { journalEntryService } from '@/features/accounting/services';
import {
  buildBankSideCandidates,
  buildBankSideCandidatesFromStatementLines,
  buildBooksSideCandidatesFromTransactions,
  buildOrphanedLedgerCandidates,
} from '../utils/candidates';
import { proveWholePeriod, type WholePeriodProof } from '../services';

export interface UseWholePeriodProofParams {
  bankAccountId?: ID;
  bankGlAccountId?: ID;
  windowStart?: string;
  windowEnd?: string;
  /** Only fetch when the whole-period tab is actually shown. */
  enabled: boolean;
}

/**
 * PART I — the whole-period proof surface. Builds the SAME candidate pools
 * the Difference Investigator uses (statement lines when a statement covers
 * the window, else the `source='import'` fallback; this-account non-import
 * transactions + orphaned GL lines on the books side) and runs
 * `proveWholePeriod` over them, in both directions.
 */
export function useWholePeriodProof({ bankAccountId, bankGlAccountId, windowStart, windowEnd, enabled }: UseWholePeriodProofParams) {
  const [proof, setProof] = useState<WholePeriodProof | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const run = useCallback(async () => {
    if (!enabled || !bankAccountId || !bankGlAccountId || !windowStart || !windowEnd) return;
    try {
      setIsLoading(true);
      setError(null);
      const [lines, allTransactions, entries] = await Promise.all([
        bankStatementService.getLinesInWindow(bankAccountId, windowStart, windowEnd),
        bankTransactionService.getTransactions(),
        journalEntryService.getEntries(),
      ]);
      const thisAccountTransactions = allTransactions.filter((t) => t.bankAccountId === bankAccountId);
      const statementLineCandidates =
        lines.length > 0
          ? buildBankSideCandidatesFromStatementLines(lines, windowStart, windowEnd)
          : buildBankSideCandidates(thisAccountTransactions, windowStart, windowEnd);

      const postedJournalEntryIds = new Set(allTransactions.map((t) => t.journalEntryId).filter((x): x is string => Boolean(x)));
      const orphaned = buildOrphanedLedgerCandidates(entries, postedJournalEntryIds, bankGlAccountId, windowStart, windowEnd);
      const booksCandidates = [...buildBooksSideCandidatesFromTransactions(thisAccountTransactions, windowStart, windowEnd), ...orphaned];

      setProof(proveWholePeriod({ windowStart, windowEnd, statementLineCandidates, booksCandidates }));
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [enabled, bankAccountId, bankGlAccountId, windowStart, windowEnd]);

  useEffect(() => {
    void run();
  }, [run]);

  return { proof, isLoading, error, refetch: run };
}
