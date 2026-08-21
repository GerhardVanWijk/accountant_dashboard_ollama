import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useTrialBalance } from '../hooks/useTrialBalance';
import { useSubledgerReconciliation } from '../hooks/useSubledgerReconciliation';
import { TrialBalanceTable } from '../components/TrialBalanceTable';
import { SubledgerReconciliationCard } from '../components/SubledgerReconciliationCard';

/** Trial Balance — route `/accounting/trial-balance` (docs/ROUTES.md). */
export function TrialBalancePage() {
  const { trialBalance, loading, error, refetch } = useTrialBalance();
  const { ar, ap, loading: reconciliationLoading } = useSubledgerReconciliation();

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Trial Balance</h1>
          <p className="mt-xs text-sm text-text-secondary">
            Net posted balance per account, debit and credit columns, as of now.
          </p>
        </div>
        <Button variant="ghost" onClick={refetch}>
          Refresh
        </Button>
      </div>

      {loading && <Spinner label="Computing trial balance…" />}

      {!loading && error && <ErrorState message={error.message} onRetry={refetch} />}

      {!loading && !error && trialBalance && trialBalance.rows.length === 0 && (
        <EmptyState title="Nothing posted yet" message="Post a journal entry to see it reflected in the trial balance." />
      )}

      {!loading && !error && trialBalance && trialBalance.rows.length > 0 && (
        <TrialBalanceTable trialBalance={trialBalance} />
      )}

      <div>
        <h2 className="mb-sm text-lg font-semibold text-text-primary">Subledger Reconciliation</h2>
        <p className="mb-md text-sm text-text-secondary">
          Confirms the Accounts Receivable and Accounts Payable control accounts agree with the sum of open
          invoices/bills — SA_ACCOUNTING_MASTER_SPEC.md §17/§18/§70/§71.
        </p>
        {reconciliationLoading && <Spinner label="Reconciling subledgers…" />}
        {!reconciliationLoading && ar && ap && (
          <div className="grid grid-cols-1 gap-md md:grid-cols-2">
            <SubledgerReconciliationCard label="Accounts Receivable" reconciliation={ar} />
            <SubledgerReconciliationCard label="Accounts Payable" reconciliation={ap} />
          </div>
        )}
      </div>
    </div>
  );
}
