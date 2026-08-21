import { useEffect, useMemo, useState } from 'react';
import type { BankAccount } from '@/types';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/feedback/Spinner';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useBankAccounts } from '../hooks/useBankAccounts';
import { useBankReconciliation } from '../hooks/useBankReconciliation';
import { ReconciliationWorkspace } from '../components/ReconciliationWorkspace';
import { ReconciliationHistory } from '../components/ReconciliationHistory';

const inputClass =
  'w-full rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/**
 * Bank Reconciliation — compares Bank Statement Balance vs GL Cashbook
 * Balance for one account at a time, with a real-time variance indicator
 * and an immutable reconciliation-history list. Route
 * `/banking/reconciliation` (docs/ROUTES.md, wired by Queen Bee).
 */
export function BankReconciliationPage() {
  const { bankAccounts, isLoading } = useBankAccounts();
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');

  useEffect(() => {
    if (!selectedAccountId && bankAccounts.length > 0) {
      setSelectedAccountId(bankAccounts.find((a) => a.status === 'active')?.id ?? bankAccounts[0].id);
    }
  }, [bankAccounts, selectedAccountId]);

  const selectedAccount = useMemo(
    () => bankAccounts.find((a) => a.id === selectedAccountId),
    [bankAccounts, selectedAccountId],
  );

  return (
    <div className="flex flex-col gap-lg">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Bank Reconciliation</h1>
        <p className="mt-xs text-sm text-text-secondary">
          Match the bank statement against the GL cashbook, clear outstanding items, and finalize once the variance
          is zero.
        </p>
      </div>

      <Card className="flex flex-col gap-xs sm:flex-row sm:items-center sm:gap-md">
        <label className="flex flex-1 flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Bank Account</span>
          <select
            aria-label="Select bank account to reconcile"
            className={inputClass}
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
          >
            {bankAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.bankName})
              </option>
            ))}
          </select>
        </label>
      </Card>

      {isLoading && <Spinner label="Loading bank accounts…" />}

      {!isLoading && bankAccounts.length === 0 && (
        <EmptyState
          title="No bank accounts yet"
          message="Set up a bank account on the Cash & Bank Accounts page before reconciling."
        />
      )}

      {!isLoading && selectedAccount && <ReconciliationSection account={selectedAccount} />}
    </div>
  );
}

function ReconciliationSection({ account }: { account: BankAccount }) {
  const [tab, setTab] = useState<'workspace' | 'history'>('workspace');
  const { history, refetchHistory } = useBankReconciliation(account.id);

  return (
    <div className="flex flex-col gap-md">
      <div className="flex gap-xs border-b border-border" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'workspace'}
          onClick={() => setTab('workspace')}
          className={`px-md py-sm text-sm font-medium ${
            tab === 'workspace' ? 'border-b-2 border-primary text-text-primary' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Reconcile {account.name}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'history'}
          onClick={() => setTab('history')}
          className={`px-md py-sm text-sm font-medium ${
            tab === 'history' ? 'border-b-2 border-primary text-text-primary' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          History ({history.length})
        </button>
      </div>

      {tab === 'workspace' && <ReconciliationWorkspace bankAccount={account} onFinalized={() => void refetchHistory()} />}
      {tab === 'history' && <ReconciliationHistory history={history} />}
    </div>
  );
}
