import { useCallback, useEffect, useState } from 'react';
import type { Account, ID } from '@/types';
import { accountService, journalEntryService, type LedgerRow } from '../services';

export interface UseAccountLedgerResult {
  account: Account | undefined;
  rows: LedgerRow[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Component -> useAccountLedger -> {accountService, journalEntryService}.
 * `journalEntryService.getAccountLedger()` already computes the running
 * balance server-side (docs/LEDGER_ARCHITECTURE.md) — this hook does not
 * reimplement any of that math, it only fetches and exposes it.
 */
export function useAccountLedger(accountId: ID | null): UseAccountLedgerResult {
  const [account, setAccount] = useState<Account | undefined>(undefined);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (!accountId) {
      setAccount(undefined);
      setRows([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [acc, ledgerRows] = await Promise.all([
        accountService.getAccount(accountId),
        journalEntryService.getAccountLedger(accountId),
      ]);
      setAccount(acc);
      setRows(ledgerRows);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load account ledger'));
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  return { account, rows, loading, error, refetch: load };
}
