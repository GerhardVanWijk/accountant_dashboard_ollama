import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Account, ID } from '@/types';
import { accountService, type CreateAccountDTO } from '../services';

export interface UseAccountsResult {
  accounts: Account[];
  /** account id -> true if any posted journal line references it. Loaded
   * alongside the accounts so the UI can show ledger-history status and
   * the form can explain why deleting isn't offered for that row. */
  postedAccountIds: Set<ID>;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createAccount: (data: CreateAccountDTO) => Promise<Account>;
  updateAccount: (id: ID, patch: Partial<Account>) => Promise<Account>;
  /** Deactivates the account if it has posting history, otherwise hard-deletes it
   * — mirrors AccountService.deleteAccount()'s guard. */
  deleteAccount: (id: ID) => Promise<void>;
}

/**
 * Component -> useAccounts -> accountService -> MockAccountRepository, per
 * the standard Data Access Layer (docs/ARCHITECTURE.md). Every mutation
 * re-fetches so every consumer stays in sync without a global store.
 */
export function useAccounts(): UseAccountsResult {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [postedAccountIds, setPostedAccountIds] = useState<Set<ID>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, postedIds] = await Promise.all([
        accountService.getAccounts(),
        // One pass over the ledger for the whole chart — NOT one hasPostings()
        // (= one full journal fetch) per account. See docs/CURRENT_TASKS.md #5.
        accountService.getAccountIdsWithPostings(),
      ]);
      setAccounts(data);
      setPostedAccountIds(postedIds);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load chart of accounts'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createAccount = useCallback(
    async (data: CreateAccountDTO) => {
      const created = await accountService.createAccount(data);
      await load();
      return created;
    },
    [load],
  );

  const updateAccount = useCallback(
    async (id: ID, patch: Partial<Account>) => {
      const updated = await accountService.updateAccount(id, patch);
      await load();
      return updated;
    },
    [load],
  );

  const deleteAccount = useCallback(
    async (id: ID) => {
      await accountService.deleteAccount(id);
      await load();
    },
    [load],
  );

  return useMemo(
    () => ({ accounts, postedAccountIds, loading, error, refetch: load, createAccount, updateAccount, deleteAccount }),
    [accounts, postedAccountIds, loading, error, load, createAccount, updateAccount, deleteAccount],
  );
}
