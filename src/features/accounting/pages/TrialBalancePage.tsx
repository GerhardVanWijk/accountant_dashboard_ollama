import { useMemo } from 'react';
import { CheckCircle2, Loader2, TriangleAlert } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { formatCurrency } from '@/lib/app/format';
import { useAccounts } from '../hooks/useAccounts';
import { useTrialBalance } from '../hooks/useTrialBalance';
import { useSubledgerReconciliation } from '../hooks/useSubledgerReconciliation';
import { TrialBalanceTable } from '../components/TrialBalanceTable';
import { SubledgerReconciliationCard } from '../components/SubledgerReconciliationCard';

/**
 * Trial Balance — route `/accounting/trial-balance` (docs/ROUTES.md). Every
 * figure comes straight from journalEntryService.computeTrialBalance() —
 * this page only formats and lays it out. v0's page implies a period
 * selector ("balances as at the end of {period}") but the real
 * computeTrialBalance() has no `asOfDate` parameter — it is always a live
 * snapshot across all posted history — so no period selector is offered
 * here; inventing one would mean recomputing the trial balance in the UI,
 * which the accounting-safety rule forbids. See the M3 report.
 */
export function TrialBalancePage() {
  const { accounts } = useAccounts();
  const { trialBalance, loading, error, refetch } = useTrialBalance();
  const { ar, ap, loading: reconciliationLoading } = useSubledgerReconciliation();

  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const difference = trialBalance ? trialBalance.totalDebits - trialBalance.totalCredits : 0;

  return (
    <>
      <PageHeader
        title="Trial balance"
        description="Net posted balance per account, debit and credit columns, live as of now."
        actions={
          <Button variant="outline" size="sm" onClick={refetch}>
            Refresh
          </Button>
        }
      />

      {loading && (
        <div role="status" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Computing trial balance…</p>
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-destructive">{error.message}</p>
          <Button variant="outline" size="sm" onClick={refetch}>
            Try again
          </Button>
        </div>
      )}

      {!loading && !error && trialBalance && (
        <SectionCard>
          <div className="flex flex-col gap-5">
            <div className="grid gap-6 sm:grid-cols-3">
              <FigureBlock
                label="Total debits"
                value={formatCurrency(trialBalance.totalDebits)}
                hint={`${trialBalance.rows.filter((r) => r.debit > 0).length} accounts with debit balances`}
              />
              <FigureBlock
                label="Total credits"
                value={formatCurrency(trialBalance.totalCredits)}
                hint={`${trialBalance.rows.filter((r) => r.credit > 0).length} accounts with credit balances`}
              />
              <FigureBlock
                label="Difference"
                value={formatCurrency(Math.abs(difference))}
                hint={trialBalance.balanced ? 'Debits equal credits' : 'Requires investigation'}
                tone={trialBalance.balanced ? 'positive' : 'negative'}
              />
            </div>

            <div
              role="status"
              className={
                trialBalance.balanced
                  ? 'flex items-start gap-3 rounded-lg border border-status-positive/30 bg-status-positive/10 p-4'
                  : 'flex items-start gap-3 rounded-lg border border-status-negative/30 bg-status-negative/10 p-4'
              }
            >
              {trialBalance.balanced ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-positive" aria-hidden="true" />
              ) : (
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-negative" aria-hidden="true" />
              )}
              <p className="text-sm leading-relaxed">
                {trialBalance.balanced ? (
                  <>
                    <span className="font-medium">Balanced — total debits equal total credits.</span>{' '}
                    <span className="text-muted-foreground">
                      Debits and credits agree across all {trialBalance.rows.length} accounts.
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-medium">Out of balance.</span>{' '}
                    <span className="text-muted-foreground">Review recent journals for a one-sided posting.</span>
                  </>
                )}
              </p>
            </div>
          </div>
        </SectionCard>
      )}

      {!loading && !error && trialBalance && trialBalance.rows.length === 0 && (
        <SectionCard>
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nothing posted yet — post a journal entry to see it reflected in the trial balance.
          </p>
        </SectionCard>
      )}

      {!loading && !error && trialBalance && trialBalance.rows.length > 0 && (
        <TrialBalanceTable
          rows={trialBalance.rows}
          totals={{ debit: trialBalance.totalDebits, credit: trialBalance.totalCredits }}
          accountsById={accountsById}
        />
      )}

      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Subledger reconciliation</h2>
          <p className="text-sm text-muted-foreground">
            Confirms the Accounts Receivable and Accounts Payable control accounts agree with the sum of open
            invoices/bills — SA_ACCOUNTING_MASTER_SPEC.md §17/§18/§70/§71.
          </p>
        </div>
        {reconciliationLoading && (
          <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Reconciling subledgers…
          </div>
        )}
        {!reconciliationLoading && ar && ap && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SubledgerReconciliationCard label="Accounts receivable" reconciliation={ar} />
            <SubledgerReconciliationCard label="Accounts payable" reconciliation={ap} />
          </div>
        )}
      </div>
    </>
  );
}
