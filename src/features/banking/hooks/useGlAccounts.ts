import { useEffect, useState } from 'react';
import type { Account } from '@/types';
import { accountService } from '@/features/accounting/services';

/**
 * Active Chart of Accounts entries, for the GL-account pickers on the
 * BankAccount form and split-allocation lines. Imports the published
 * `accountService` singleton only — never a repository — per
 * docs/DO_NOT_BREAK.md "Repositories" and this dispatch's scope boundary
 * (import from src/features/accounting/services, never edit those files).
 */
export function useGlAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    accountService.getAccounts().then((data) => {
      if (cancelled) return;
      setAccounts(data.filter((a) => a.isActive));
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { accounts, isLoading };
}
