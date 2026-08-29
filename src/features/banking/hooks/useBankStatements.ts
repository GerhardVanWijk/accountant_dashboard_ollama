import { useCallback, useEffect, useState } from 'react';
import type { BankStatement, BankStatementLine, ID } from '@/types';
import { bankStatementService } from '../services';

/**
 * Every persisted `bank_statements` row for an account (migration 0020),
 * newest period first — the source for the reconciliation page's statement
 * selector. Separate from `useBankTransactions`: a statement is the bank's
 * own first-class version of events, not a derived view of transactions.
 */
export function useBankStatements(bankAccountId: ID | undefined) {
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStatements = useCallback(async () => {
    if (!bankAccountId) {
      setStatements([]);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      setStatements(await bankStatementService.getStatements(bankAccountId));
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [bankAccountId]);

  useEffect(() => {
    void fetchStatements();
  }, [fetchStatements]);

  return { statements, isLoading, error, refetch: fetchStatements };
}

/**
 * A single persisted statement plus its ordered `bank_statement_lines` — the
 * bank side the side-by-side workspace is scoped to. `undefined` statementId
 * (no statement chosen / none exists for the account) resolves to an empty,
 * non-loading state so the workspace can show its own "import a statement"
 * empty state.
 */
export function useReconciliationStatement(statementId: ID | undefined) {
  const [statement, setStatement] = useState<BankStatement | null>(null);
  const [lines, setLines] = useState<BankStatementLine[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(statementId));
  const [error, setError] = useState<Error | null>(null);

  const fetchStatement = useCallback(async () => {
    if (!statementId) {
      setStatement(null);
      setLines([]);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const result = await bankStatementService.getStatementWithLines(statementId);
      setStatement(result?.statement ?? null);
      setLines(result?.lines ?? []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [statementId]);

  useEffect(() => {
    void fetchStatement();
  }, [fetchStatement]);

  return { statement, lines, isLoading, error, refetch: fetchStatement };
}
