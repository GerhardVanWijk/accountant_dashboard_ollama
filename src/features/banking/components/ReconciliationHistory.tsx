import { useState } from 'react';
import { ChevronDown, CircleCheck } from 'lucide-react';
import { SectionCard } from '@/components/app/page-header';
import { Amount } from '@/components/app/figure';
import { RecordLink } from '@/components/app/record-link';
import { formatDateTime, formatDate } from '@/lib/app/format';
import { cn } from '@/lib/utils';
import type { BankTransactionWithAllocations, BankReconciliation } from '../types';

export interface ReconciliationHistoryProps {
  history: BankReconciliation[];
  /** All transactions for this account — resolves the id lists below into real rows. */
  transactionsById: Map<string, BankTransactionWithAllocations>;
  onSelectTransaction: (transactionId: string) => void;
}

/**
 * Immutable reconciliation-history list, re-skinned onto v0's card
 * language. Every entry here is a finalized BankReconciliation snapshot —
 * `IBankReconciliationRepository` has no update()/delete() at all, so
 * nothing in this UI can edit or reopen a past reconciliation (there is no
 * such capability in the real backend to wire up — see the M5 report).
 *
 * Each summary line ("N cleared" etc.) expands to the actual cleared/
 * unpresented/uncleared transactions it references — the reconciliation
 * side of the traceability chain (transaction → reconciliation, and now
 * reconciliation → its transactions).
 */
export function ReconciliationHistory({ history, transactionsById, onSelectTransaction }: ReconciliationHistoryProps) {
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
        <ReconciliationCard key={r.id} reconciliation={r} transactionsById={transactionsById} onSelectTransaction={onSelectTransaction} />
      ))}
    </div>
  );
}

function ReconciliationCard({
  reconciliation: r,
  transactionsById,
  onSelectTransaction,
}: {
  reconciliation: BankReconciliation;
  transactionsById: Map<string, BankTransactionWithAllocations>;
  onSelectTransaction: (transactionId: string) => void;
}) {
  const [expanded, setExpanded] = useState<'cleared' | 'unpresented' | 'uncleared' | null>(null);

  const groups: Array<{ key: 'cleared' | 'unpresented' | 'uncleared'; label: string; ids: string[] }> = [
    { key: 'cleared', label: `${r.clearedTransactionIds.length} cleared`, ids: r.clearedTransactionIds },
    { key: 'unpresented', label: `${r.unpresentedTransactionIds.length} unpresented payments outstanding`, ids: r.unpresentedTransactionIds },
    { key: 'uncleared', label: `${r.unclearedDepositIds.length} uncleared deposits outstanding`, ids: r.unclearedDepositIds },
  ];

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col">
          <h3 className="font-medium">Statement dated {formatDate(r.statementDate)}</h3>
          <span className="text-xs text-muted-foreground">
            Finalized {formatDateTime(r.finalizedAt)} by {r.finalizedByUserId}
          </span>
        </div>
        <span className="flex items-center gap-1.5 text-xs font-medium text-status-positive">
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

      <div className="flex flex-col gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {groups.map((g) =>
            g.ids.length > 0 ? (
              <button
                key={g.key}
                type="button"
                onClick={() => setExpanded(expanded === g.key ? null : g.key)}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                {g.label}
                <ChevronDown className={cn('size-3 transition-transform', expanded === g.key && 'rotate-180')} aria-hidden="true" />
              </button>
            ) : (
              <span key={g.key}>{g.label}</span>
            ),
          )}
          {r.notes && <span className="italic">{r.notes}</span>}
        </div>

        {expanded && (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-background/40">
            {groups
              .find((g) => g.key === expanded)!
              .ids.map((id) => {
                const txn = transactionsById.get(id);
                return (
                  <li key={id} className="flex items-center justify-between gap-3 px-3 py-2">
                    {txn ? (
                      <>
                        <RecordLink onClick={() => onSelectTransaction(id)} className="text-xs">
                          {txn.description}
                        </RecordLink>
                        <span className="figure text-xs tabular-nums text-muted-foreground">
                          {formatDate(txn.date)} · <Amount value={txn.amount} plain />
                        </span>
                      </>
                    ) : (
                      <span className="px-0 py-0 text-xs text-muted-foreground">Transaction {id} (no longer available)</span>
                    )}
                  </li>
                );
              })}
          </ul>
        )}
      </div>
    </article>
  );
}
