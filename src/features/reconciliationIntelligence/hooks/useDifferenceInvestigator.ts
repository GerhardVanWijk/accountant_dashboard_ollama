import { useCallback, useMemo, useState } from 'react';
import type { ID, ReconciliationIssue } from '@/types';
import { SYSTEM_USER_ID } from '@/features/accounting/services';
import { reconciliationInvestigatorService, reconciliationIssueResolutionService } from '../services';
import type { InvestigationResult } from '../services';

/**
 * Drives the Difference Investigator panel. Investigation is explicit (a
 * button, not auto-run on every keystroke like useBankReconciliation's live
 * summary) — it does real work (candidate-pool building, detector runs,
 * persistence) and shouldn't fire on every statement-balance digit typed.
 * Reuses the exact same statementDate/statementBalance/clearedTransactionIds
 * the reconciliation workspace already has — this panel investigates THAT
 * workspace's current unexplained variance, not a separate concept.
 */
export function useDifferenceInvestigator(bankAccountId: ID | undefined) {
  const [result, setResult] = useState<InvestigationResult | null>(null);
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const investigate = useCallback(
    async (statementDate: string, statementBalance: number, clearedTransactionIds: ID[]) => {
      if (!bankAccountId) return;
      try {
        setIsInvestigating(true);
        setError(null);
        const outcome = await reconciliationInvestigatorService.investigate(bankAccountId, statementDate, statementBalance, clearedTransactionIds);
        setResult(outcome);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsInvestigating(false);
      }
    },
    [bankAccountId],
  );

  const replaceIssue = useCallback((updated: ReconciliationIssue) => {
    setResult((prev) => (prev ? { ...prev, issues: prev.issues.map((i) => (i.id === updated.id ? updated : i)) } : prev));
  }, []);

  const reviewIssue = useCallback(
    async (issueId: ID) => {
      const updated = await reconciliationIssueResolutionService.reviewIssue(issueId, SYSTEM_USER_ID);
      replaceIssue(updated);
    },
    [replaceIssue],
  );

  const dismissIssue = useCallback(
    async (issueId: ID, reason: string) => {
      const updated = await reconciliationIssueResolutionService.dismissIssue(issueId, SYSTEM_USER_ID, reason);
      replaceIssue(updated);
    },
    [replaceIssue],
  );

  const markAutoSafe = useCallback(
    async (issueId: ID) => {
      const updated = await reconciliationIssueResolutionService.markAutoSafe(issueId, SYSTEM_USER_ID);
      replaceIssue(updated);
    },
    [replaceIssue],
  );

  const resolveIssue = useCallback(
    async (issueId: ID, reason: string) => {
      const updated = await reconciliationIssueResolutionService.resolveIssue(issueId, SYSTEM_USER_ID, reason);
      replaceIssue(updated);
    },
    [replaceIssue],
  );

  return useMemo(
    () => ({ result, isInvestigating, error, investigate, reviewIssue, dismissIssue, markAutoSafe, resolveIssue }),
    [result, isInvestigating, error, investigate, reviewIssue, dismissIssue, markAutoSafe, resolveIssue],
  );
}
