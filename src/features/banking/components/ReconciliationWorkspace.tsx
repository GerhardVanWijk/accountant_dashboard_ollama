import { useState } from 'react';
import { CheckCircle2, TriangleAlert } from 'lucide-react';
import type { BankAccount } from '@/types';
import { SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Amount } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { useBankReconciliation } from '../hooks/useBankReconciliation';

export interface ReconciliationWorkspaceProps {
  bankAccount: BankAccount;
  onFinalized?: () => void;
}

/**
 * Interactive bank reconciliation workspace — same
 * useBankReconciliation()/BankReconciliationService wiring as before the
 * port, JSX re-skinned onto v0's SectionCard/FigureBlock. Every figure
 * (glCashbookBalance, adjustedBankBalance, variance, outstanding items)
 * comes from `computeSummary()` — nothing is summed independently here.
 * The Finalize button is disabled client-side whenever variance ≠ 0 or an
 * item still needs allocation, but the real enforcement is in
 * `BankReconciliationService.finalizeReconciliation()`, which
 * independently re-derives the summary and throws before writing anything.
 */
export function ReconciliationWorkspace({ bankAccount, onFinalized }: ReconciliationWorkspaceProps) {
  const {
    statementDate,
    setStatementDate,
    statementBalance,
    setStatementBalance,
    clearedIds,
    toggleCleared,
    summary,
    isLoading,
    isFinalizing,
    error,
    finalize,
  } = useBankReconciliation(bankAccount.id);

  const [notes, setNotes] = useState('');
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  const outstanding = summary
    ? [...summary.unclearedDeposits, ...summary.unpresentedPayments].sort((a, b) => a.date.localeCompare(b.date))
    : [];

  const canFinalize = Boolean(summary?.isBalanced) && (summary?.unallocatedItems.length ?? 1) === 0 && clearedIds.size > 0;

  async function handleFinalize() {
    setFinalizeError(null);
    try {
      await finalize(notes || undefined);
      setNotes('');
      onFinalized?.();
    } catch (err) {
      setFinalizeError(err instanceof Error ? err.message : 'Could not finalize reconciliation.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionCard>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="recon-statement-date">Statement date</FieldLabel>
            <Input id="recon-statement-date" type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="recon-statement-balance">Bank statement closing balance</FieldLabel>
            <Input
              id="recon-statement-balance"
              type="number"
              step="0.01"
              value={statementBalance || ''}
              onChange={(e) => setStatementBalance(parseFloat(e.target.value) || 0)}
            />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">GL cashbook balance</span>
            <div className="figure flex h-8 items-center rounded-lg border border-input bg-muted/30 px-2.5 text-sm">
              {summary ? <Amount value={summary.glCashbookBalance} plain /> : '—'}
            </div>
          </div>
        </div>
      </SectionCard>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </p>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Calculating…</p>}

      {summary && (
        <SectionCard className={summary.isBalanced ? 'border-status-positive/40 bg-status-positive/5' : 'border-status-negative/40 bg-status-negative/5'}>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              {summary.isBalanced ? (
                <CheckCircle2 className="size-5 text-status-positive" aria-hidden="true" />
              ) : (
                <TriangleAlert className="size-5 text-status-negative" aria-hidden="true" />
              )}
              <span className={summary.isBalanced ? 'text-lg font-semibold text-status-positive' : 'text-lg font-semibold text-status-negative'}>
                {summary.isBalanced ? 'Balanced — ready to finalize' : 'Out of balance'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <FigureBlock label="Uncleared deposits" value={formatCurrency(summary.unclearedDepositsTotal)} hint={`${summary.unclearedDeposits.length} items`} />
              <FigureBlock label="Unpresented payments" value={formatCurrency(-summary.unpresentedPaymentsTotal)} hint={`${summary.unpresentedPayments.length} items`} />
              <FigureBlock label="Adjusted bank balance" value={formatCurrency(summary.adjustedBankBalance)} />
              <FigureBlock label="Variance" value={formatCurrency(summary.variance)} tone={summary.isBalanced ? 'positive' : 'negative'} />
            </div>
            {summary.unallocatedItems.length > 0 && (
              <p className="rounded-lg bg-status-warning/15 px-3 py-2 text-xs text-status-warning">
                {summary.unallocatedItems.length} transaction(s) still need a GL allocation before they can be cleared —
                allocate them from the Bank Transactions page first.
              </p>
            )}
          </div>
        </SectionCard>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[40px_100px_1.6fr_130px_120px_140px] gap-3 border-b border-border bg-muted/40 px-4 py-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <span>Clear</span>
            <span>Date</span>
            <span>Description</span>
            <span>Reference</span>
            <span className="text-right">Amount</span>
            <span>Type</span>
          </div>
          {outstanding.map((txn) => {
            const unallocated = txn.allocations.length === 0 && !txn.transferPairId;
            const signed = txn.direction === 'credit' ? -txn.amount : txn.amount;
            return (
              <div key={txn.id} className="grid grid-cols-[40px_100px_1.6fr_130px_120px_140px] gap-3 border-b border-border/50 px-4 py-3 text-sm tabular-nums">
                <input
                  type="checkbox"
                  aria-label={`Mark ${txn.description} as cleared`}
                  checked={clearedIds.has(txn.id)}
                  disabled={unallocated}
                  onChange={() => toggleCleared(txn.id)}
                  className="size-4 rounded border-input"
                />
                <span className="text-muted-foreground">{formatDate(txn.date)}</span>
                <span className="flex items-center gap-1.5">
                  {txn.description}
                  {unallocated && (
                    <span className="rounded-full bg-status-warning/15 px-2 py-0.5 text-xs font-medium text-status-warning">Needs allocation</span>
                  )}
                </span>
                <span className="figure text-xs text-muted-foreground">{txn.reference ?? '—'}</span>
                <span className="text-right">
                  <Amount value={signed} plain />
                </span>
                <span className="text-muted-foreground">{txn.direction === 'debit' ? 'Uncleared deposit' : 'Unpresented payment'}</span>
              </div>
            );
          })}
          {outstanding.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No outstanding items up to this statement date — everything is already cleared.
            </div>
          )}
        </div>
      </div>

      <SectionCard>
        <div className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="recon-notes">Notes (optional)</FieldLabel>
            <Textarea id="recon-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {finalizeError && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {finalizeError}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {canFinalize ? `${clearedIds.size} transaction(s) will be marked reconciled.` : 'Select cleared items and reach a zero variance to finalize.'}
            </p>
            <Button disabled={!canFinalize || isFinalizing} onClick={() => void handleFinalize()}>
              {isFinalizing ? 'Finalizing…' : 'Finalize reconciliation'}
            </Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
