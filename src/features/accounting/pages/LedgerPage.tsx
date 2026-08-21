import { useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { formatCurrency } from '@/utils/formatFinancial';
import { useAccounts } from '../hooks/useAccounts';
import { useAccountLedger } from '../hooks/useAccountLedger';
import { LedgerTable } from '../components/LedgerTable';
import { useAccountingUiStore } from '../store/accountingUiStore';
import { accountTypeLabel } from '../types/account.types';

const inputClass =
  'w-full max-w-md rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/** General Ledger detail — route `/accounting/ledger` (docs/ROUTES.md). */
export function LedgerPage() {
  const { accounts, loading: accountsLoading, error: accountsError, refetch: refetchAccounts } = useAccounts();
  const selectedAccountId = useAccountingUiStore((s) => s.selectedLedgerAccountId);
  const setSelectedAccountId = useAccountingUiStore((s) => s.setSelectedLedgerAccountId);

  // Default to the first account once the chart has loaded, if nothing is selected yet.
  useEffect(() => {
    if (!selectedAccountId && accounts.length > 0) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId, setSelectedAccountId]);

  const { account, rows, loading, error, refetch } = useAccountLedger(selectedAccountId);

  return (
    <div className="flex flex-col gap-lg">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">General Ledger Detail</h1>
        <p className="mt-xs text-sm text-text-secondary">
          Full posted-line history for a single account, with a running balance in the account's normal-balance
          direction.
        </p>
      </div>

      <Card className="flex flex-col gap-sm">
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Account</span>
          {accountsLoading && <Spinner label="Loading accounts…" />}
          {!accountsLoading && accountsError && <ErrorState message={accountsError.message} onRetry={refetchAccounts} />}
          {!accountsLoading && !accountsError && accounts.length === 0 && (
            <EmptyState title="No accounts yet" message="Create an account in the Chart of Accounts first." />
          )}
          {!accountsLoading && !accountsError && accounts.length > 0 && (
            <select
              aria-label="Select account"
              className={inputClass}
              value={selectedAccountId ?? ''}
              onChange={(e) => setSelectedAccountId(e.target.value || null)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name} ({accountTypeLabel(a.type)})
                </option>
              ))}
            </select>
          )}
        </label>
      </Card>

      {loading && <Spinner label="Loading account ledger…" />}

      {!loading && error && <ErrorState message={error.message} onRetry={refetch} />}

      {!loading && !error && account && rows.length === 0 && (
        <EmptyState title="No postings yet" message={`"${account.name}" has no posted journal lines yet.`} />
      )}

      {!loading && !error && account && rows.length > 0 && (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-sm">
            <div>
              <p className="text-sm text-text-secondary">Closing Balance</p>
              <p className="font-mono text-xs text-text-muted">
                {account.code} — {account.name} · normal balance: {account.normalBalance}
              </p>
            </div>
            <FinancialNumber
              value={rows[rows.length - 1].runningBalance}
              format={formatCurrency}
              className="text-lg font-semibold"
              showFlash={false}
            />
          </Card>
          <LedgerTable rows={rows} />
        </>
      )}
    </div>
  );
}
