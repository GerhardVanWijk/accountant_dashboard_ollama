import { useMemo } from 'react';
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Loader2, Scale, TriangleAlert } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { StatTile } from '@/components/app/stat-tile';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
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
  const { ar, ap, deposits, loading: reconciliationLoading } = useSubledgerReconciliation();

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
        // docs/CURRENT_TASKS.md #26 — summary-strip + table placeholder rather
        // than a blank page and one spinner.
        <div role="status" aria-label="Computing trial balance" className="flex flex-col gap-6">
          <div className="grid gap-4 rounded-xl border border-border p-5 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                <div className="h-6 w-32 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="h-10 border-b border-border bg-muted/40" />
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-border/50 px-4 py-3 last:border-0">
                <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                <div className="h-4 flex-1 animate-pulse rounded bg-muted" style={{ maxWidth: `${45 + ((i * 11) % 40)}%` }} />
                <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
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
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatTile
            icon={ArrowDownLeft}
            label="Total debits"
            value={formatCurrency(trialBalance.totalDebits)}
            hint={`${trialBalance.rows.filter((r) => r.debit > 0).length} accounts with debit balances`}
            tone="info"
          />
          <StatTile
            icon={ArrowUpRight}
            label="Total credits"
            value={formatCurrency(trialBalance.totalCredits)}
            hint={`${trialBalance.rows.filter((r) => r.credit > 0).length} accounts with credit balances`}
            tone="info"
          />
          <div
            role="status"
            className={cn(
              'flex flex-col justify-center gap-2 rounded-xl border-2 p-4 sm:p-5 md:col-span-2 xl:col-span-2',
              trialBalance.balanced
                ? 'border-status-positive-outline bg-status-positive-surface/60'
                : 'border-status-negative-outline bg-status-negative-surface/60',
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[0.7rem] font-semibold tracking-wider text-muted-foreground uppercase">
                Difference
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                  trialBalance.balanced
                    ? 'bg-status-positive-muted text-status-positive'
                    : 'bg-status-negative-muted text-status-negative',
                )}
              >
                {trialBalance.balanced ? (
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                ) : (
                  <TriangleAlert className="size-3.5" aria-hidden="true" />
                )}
                {trialBalance.balanced ? 'Balanced' : 'Out of balance'}
              </span>
            </div>
            <span
              className={cn(
                'figure text-3xl font-bold tabular-nums tracking-tight',
                trialBalance.balanced ? 'text-status-positive' : 'text-status-negative',
              )}
            >
              {formatCurrency(Math.abs(difference))}
            </span>
            <span className="text-xs leading-relaxed text-muted-foreground">
              {trialBalance.balanced
                ? `Total debits equal total credits across all ${trialBalance.rows.length} posted accounts.`
                : 'Debits and credits disagree — review recent journals for a one-sided posting.'}
            </span>
          </div>
        </div>
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

      <section className="flex flex-col gap-4 border-t border-border pt-6">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-muted text-brand">
              <Scale className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground">Subledger reconciliation</h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Confirms the Accounts Receivable and Accounts Payable control accounts agree with the sum of open
                invoices and bills — SA_ACCOUNTING_MASTER_SPEC.md §17/§18/§70/§71.
              </p>
            </div>
          </div>
          {!reconciliationLoading && ar && ap && (
            <span className="shrink-0 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
              {[ar, ap, deposits].filter((r) => r?.isReconciled).length}/
              {[ar, ap, deposits].filter(Boolean).length} reconciled
            </span>
          )}
        </div>
        {reconciliationLoading && (
          <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Reconciling subledgers…
          </div>
        )}
        {!reconciliationLoading && ar && ap && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <SubledgerReconciliationCard label="Accounts receivable" reconciliation={ar} />
            <SubledgerReconciliationCard label="Accounts payable" reconciliation={ap} />
            {deposits && <SubledgerReconciliationCard label="Customer deposits" reconciliation={deposits} />}
          </div>
        )}
      </section>
    </>
  );
}
