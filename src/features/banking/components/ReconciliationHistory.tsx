import { CircleCheck } from 'lucide-react';
import { SectionCard } from '@/components/app/page-header';
import { Amount } from '@/components/app/figure';
import { formatDateTime, formatDate } from '@/lib/app/format';
import type { BankReconciliation } from '../types';

export interface ReconciliationHistoryProps {
  history: BankReconciliation[];
}

/**
 * Immutable reconciliation-history list, re-skinned onto v0's card
 * language. Every entry here is a finalized BankReconciliation snapshot —
 * `IBankReconciliationRepository` has no update()/delete() at all, so
 * nothing in this UI can edit or reopen a past reconciliation (there is no
 * such capability in the real backend to wire up — see the M5 report).
 */
export function ReconciliationHistory({ history }: ReconciliationHistoryProps) {
  if (history.length === 0) {
    return (
      <SectionCard>
        <p className="py-8 text-center text-sm text-muted-foreground">No finalized reconciliations yet for this account.</p>
      </SectionCard>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {history.map((r) => (
        <article key={r.id} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col">
              <h3 className="font-medium">Statement dated {formatDate(r.statementDate)}</h3>
              <span className="text-xs text-muted-foreground">
                Finalized {formatDateTime(r.finalizedAt)} by {r.finalizedByUserId}
              </span>
            </div>
            <span className="flex items-center gap-1.5 text-xs font-medium text-positive">
              <CircleCheck className="size-3.5" aria-hidden="true" />
              Balanced
            </span>
          </div>

          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs tracking-wide text-muted-foreground uppercase">Statement balance</dt>
              <dd>
                <Amount value={r.statementBalance} plain className="text-sm" />
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs tracking-wide text-muted-foreground uppercase">GL cashbook balance</dt>
              <dd>
                <Amount value={r.glCashbookBalance} plain className="text-sm" />
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs tracking-wide text-muted-foreground uppercase">Adjusted bank balance</dt>
              <dd>
                <Amount value={r.adjustedBankBalance} plain className="text-sm" />
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs tracking-wide text-muted-foreground uppercase">Variance</dt>
              <dd>
                <Amount value={r.variance} plain className="text-sm font-semibold text-positive" />
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
            <span>{r.clearedTransactionIds.length} cleared</span>
            {r.unpresentedTransactionIds.length > 0 && <span>{r.unpresentedTransactionIds.length} unpresented payments outstanding</span>}
            {r.unclearedDepositIds.length > 0 && <span>{r.unclearedDepositIds.length} uncleared deposits outstanding</span>}
            {r.notes && <span className="italic">{r.notes}</span>}
          </div>
        </article>
      ))}
    </div>
  );
}
