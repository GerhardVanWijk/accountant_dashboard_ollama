import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, Search, TriangleAlert } from 'lucide-react';
import type { BankAccount } from '@/types';
import { FigureBlock } from '@/components/app/figure';
import { Amount } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDate } from '@/lib/app/format';
import type { BankTransactionWithAllocations } from '../types';
import type { ReconciliationSummary } from '../services';

type Density = 'compact' | 'comfortable';
const DENSITY_KEY = 'vertex.reconciliation.density';

function readDensity(): Density {
  try {
    const v = localStorage.getItem(DENSITY_KEY);
    return v === 'compact' || v === 'comfortable' ? v : 'comfortable';
  } catch {
    return 'comfortable';
  }
}

export interface ReconciliationWorkspaceProps {
  bankAccount: BankAccount;
  /** Every recorded transaction for this account (imported + manual + transfer legs). */
  transactions: BankTransactionWithAllocations[];
  // Shared reconciliation state — one instance, lifted to the page, so the
  // Difference Investigator investigates THIS workspace's real variance
  // (docs/CURRENT_TASKS.md #15/#17).
  statementDate: string;
  setStatementDate: (v: string) => void;
  statementBalance: number;
  setStatementBalance: (v: number) => void;
  clearedIds: Set<string>;
  toggleCleared: (id: string) => void;
  summary: ReconciliationSummary | null;
  isLoading: boolean;
  isFinalizing: boolean;
  error: Error | null;
  finalize: (notes?: string) => Promise<unknown>;
  onFinalized?: () => void;
  /** Runs the Difference Investigator against the current variance. */
  onInvestigate: () => void;
  /** Opens the real GL allocation flow for an un-coded imported line. */
  onAllocate: (txn: BankTransactionWithAllocations) => void;
  /** Opens the Bank Transactions register focused on this record. */
  onViewRecord: (id: string) => void;
}

function signed(t: BankTransactionWithAllocations): number {
  return t.direction === 'debit' ? t.amount : -t.amount;
}

type LineStatus = 'reconciled' | 'cleared' | 'needs-allocation' | 'unreconciled';

function lineStatus(t: BankTransactionWithAllocations, clearedIds: Set<string>): LineStatus {
  if (t.status === 'reconciled') return 'reconciled';
  if (clearedIds.has(t.id)) return 'cleared';
  if (t.allocations.length === 0 && !t.transferPairId) return 'needs-allocation';
  return 'unreconciled';
}

const STATUS_META: Record<LineStatus, { label: string; className: string }> = {
  reconciled: { label: 'Reconciled', className: 'bg-status-positive-muted text-status-positive' },
  cleared: { label: 'Cleared this session', className: 'bg-brand-muted text-brand' },
  'needs-allocation': { label: 'Needs allocation', className: 'bg-status-warning-muted text-status-warning' },
  unreconciled: { label: 'Unreconciled', className: 'bg-muted text-muted-foreground' },
};

/**
 * Two-pane bank reconciliation workspace (docs/CURRENT_TASKS.md #14–#17,
 * adapted from Xero's transaction-by-transaction workflow — not its visual
 * design). LEFT: every statement line for the period, compact rows, current
 * status. RIGHT: the selected line's detail + the actions available for it
 * (clear / allocate / view record / investigate). Every figure comes from
 * the injected `summary` (`computeSummary()`); nothing is summed here.
 *
 * The Finalize button is a client-side convenience gate — the real
 * enforcement is `BankReconciliationService.finalizeReconciliation()`,
 * which re-derives the summary and refuses a non-zero variance before
 * writing anything.
 */
export function ReconciliationWorkspace({
  bankAccount,
  transactions,
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
  onFinalized,
  onInvestigate,
  onAllocate,
  onViewRecord,
}: ReconciliationWorkspaceProps) {
  const [density, setDensity] = useState<Density>(readDensity);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(DENSITY_KEY, density);
    } catch {
      /* private window / storage disabled — density just won't persist */
    }
  }, [density]);

  const periodLines = useMemo(
    () =>
      transactions
        .filter((t) => t.date <= statementDate)
        .filter((t) => {
          if (!search.trim()) return true;
          const needle = search.trim().toLowerCase();
          return (
            t.description.toLowerCase().includes(needle) ||
            (t.reference ?? '').toLowerCase().includes(needle) ||
            String(t.amount).includes(needle)
          );
        })
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [transactions, statementDate, search],
  );

  const selected = periodLines.find((t) => t.id === selectedId) ?? null;

  const variance = summary?.variance ?? 0;
  const balanced = Boolean(summary?.isBalanced);
  const canFinalize = balanced && (summary?.unallocatedItems.length ?? 1) === 0 && clearedIds.size > 0;

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

  const rowPad = density === 'compact' ? 'py-1.5' : 'py-2.5';

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Shared header: statement vs books, the variance, and the top actions ---- */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="recon-statement-date">Statement date</FieldLabel>
            <Input
              id="recon-statement-date"
              type="date"
              value={statementDate}
              onChange={(e) => setStatementDate(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="recon-statement-balance">Statement closing balance</FieldLabel>
            <Input
              id="recon-statement-balance"
              type="number"
              step="0.01"
              value={statementBalance || ''}
              onChange={(e) => setStatementBalance(parseFloat(e.target.value) || 0)}
            />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Book (GL) balance</span>
            <div className="figure flex h-8 items-center rounded-lg border border-input bg-muted/30 px-2.5 text-sm tabular-nums">
              {summary ? <Amount value={summary.glCashbookBalance} plain /> : '—'}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Variance</span>
            <div
              className={cn(
                'figure flex h-8 items-center rounded-lg border px-2.5 text-sm font-semibold tabular-nums',
                balanced
                  ? 'border-status-positive-outline bg-status-positive-surface text-status-positive'
                  : 'border-status-negative-outline bg-status-negative-surface text-status-negative',
              )}
            >
              {summary ? <Amount value={variance} plain /> : '—'}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div className="flex items-center gap-2">
            {balanced ? (
              <CheckCircle2 className="size-4 text-status-positive" aria-hidden="true" />
            ) : (
              <TriangleAlert className="size-4 text-status-negative" aria-hidden="true" />
            )}
            <span className={cn('text-sm font-medium', balanced ? 'text-status-positive' : 'text-status-negative')}>
              {balanced ? 'Balanced — ready to finalize' : 'Out of balance'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!balanced && (
              <Button size="sm" variant="outline" onClick={onInvestigate}>
                <Search data-icon="inline-start" />
                Investigate {formatCurrency(variance)} difference
              </Button>
            )}
            <div className="flex items-center rounded-lg border border-border p-0.5 text-xs">
              {(['comfortable', 'compact'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDensity(d)}
                  className={cn(
                    'rounded-md px-2 py-1 capitalize transition-colors',
                    density === d ? 'bg-brand-muted text-brand' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </p>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">Calculating…</p>}

      {summary && (
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border p-4 md:grid-cols-4">
          <FigureBlock label="Uncleared deposits" value={formatCurrency(summary.unclearedDepositsTotal)} hint={`${summary.unclearedDeposits.length} items`} />
          <FigureBlock label="Unpresented payments" value={formatCurrency(-summary.unpresentedPaymentsTotal)} hint={`${summary.unpresentedPayments.length} items`} />
          <FigureBlock label="Adjusted bank balance" value={formatCurrency(summary.adjustedBankBalance)} />
          <FigureBlock label="Cleared this session" value={String(clearedIds.size)} />
        </div>
      )}

      {/* ---- Two-pane workspace ---- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* LEFT — statement lines */}
        <div className="flex flex-col gap-2 rounded-xl border border-border">
          <div className="flex items-center gap-2 border-b border-border p-2">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter statement lines…"
              aria-label="Filter statement lines"
              className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <span className="shrink-0 text-xs text-muted-foreground">{periodLines.length}</span>
          </div>
          <div className="app-scroll max-h-[32rem] overflow-y-auto">
            {periodLines.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No statement lines on or before {formatDate(statementDate)}.
              </p>
            ) : (
              <ul>
                {periodLines.map((t) => {
                  const st = lineStatus(t, clearedIds);
                  const active = t.id === selectedId;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(t.id)}
                        className={cn(
                          'flex w-full items-center gap-3 border-b border-border/60 border-l-2 px-3 text-left text-sm transition-colors',
                          rowPad,
                          active ? 'border-l-brand bg-muted/50' : 'border-l-transparent hover:bg-muted/30',
                        )}
                      >
                        <span className="w-16 shrink-0 text-xs text-muted-foreground">{formatDate(t.date)}</span>
                        <span className="min-w-0 flex-1 truncate">
                          {t.description}
                          {density === 'comfortable' && t.reference ? (
                            <span className="ml-2 font-mono text-xs text-muted-foreground">{t.reference}</span>
                          ) : null}
                        </span>
                        <span
                          className={cn(
                            'hidden shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium sm:inline',
                            STATUS_META[st].className,
                          )}
                        >
                          {STATUS_META[st].label}
                        </span>
                        <span className="w-24 shrink-0 text-right tabular-nums">
                          <Amount value={signed(t)} plain />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* RIGHT — selected line actions */}
        <div className="rounded-xl border border-border p-4">
          {!selected ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Select a statement line to match, clear, or code it.
            </p>
          ) : (
            <SelectedLinePanel
              key={selected.id}
              txn={selected}
              status={lineStatus(selected, clearedIds)}
              onToggleCleared={() => toggleCleared(selected.id)}
              onAllocate={() => onAllocate(selected)}
              onViewRecord={() => onViewRecord(selected.id)}
            />
          )}
        </div>
      </div>

      {/* ---- Finalize ---- */}
      <div className="rounded-xl border border-border p-4">
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
              {canFinalize
                ? `${clearedIds.size} transaction(s) will be marked reconciled.`
                : 'Clear the outstanding items and reach a zero variance to finalize.'}
            </p>
            <Button disabled={!canFinalize || isFinalizing} onClick={() => void handleFinalize()}>
              {isFinalizing ? 'Finalizing…' : `Finalize ${bankAccount.name}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SelectedLinePanel({
  txn,
  status,
  onToggleCleared,
  onAllocate,
  onViewRecord,
}: {
  txn: BankTransactionWithAllocations;
  status: LineStatus;
  onToggleCleared: () => void;
  onAllocate: () => void;
  onViewRecord: () => void;
}) {
  const needsAllocation = status === 'needs-allocation';
  const isReconciled = status === 'reconciled';
  const sourceLabel = txn.source === 'import' ? 'Imported from statement' : txn.source === 'transfer' ? 'Inter-account transfer' : 'Manually recorded';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold">{txn.description}</span>
          <span className="text-xs text-muted-foreground">
            {formatDate(txn.date)} · {sourceLabel}
          </span>
        </div>
        <Amount value={signed(txn)} className="shrink-0 text-lg font-semibold" />
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex flex-col">
          <dt className="text-xs text-muted-foreground">Direction</dt>
          <dd>{txn.direction === 'debit' ? 'Received (money in)' : 'Spent (money out)'}</dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-xs text-muted-foreground">Reference</dt>
          <dd className="font-mono">{txn.reference ?? '—'}</dd>
        </div>
        <div className="col-span-2 flex flex-col">
          <dt className="text-xs text-muted-foreground">Status</dt>
          <dd>
            <span className={cn('rounded-full px-1.5 py-0.5 text-xs font-medium', STATUS_META[status].className)}>
              {STATUS_META[status].label}
            </span>
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">GL coding</span>
        {txn.allocations.length === 0 ? (
          txn.transferPairId ? (
            <p className="text-sm text-muted-foreground">Transfer leg — no GL split needed (posts to the paired bank account).</p>
          ) : (
            <p className="text-sm text-status-warning">Not yet coded to a GL account.</p>
          )
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {txn.allocations.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">{a.description || a.glAccountId}</span>
                <Amount value={a.netAmount + a.taxAmount} plain className="shrink-0 tabular-nums" />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {needsAllocation && (
          <Button size="sm" onClick={onAllocate}>
            Code to a GL account
          </Button>
        )}
        {!needsAllocation && !isReconciled && (
          <Button size="sm" variant={txn.allocations.length > 0 ? 'default' : 'outline'} onClick={onAllocate}>
            {txn.allocations.length > 0 ? 'Edit coding' : 'Code to a GL account'}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={onToggleCleared}
          disabled={needsAllocation || isReconciled}
          title={
            needsAllocation
              ? 'Code this line to a GL account before it can be cleared.'
              : isReconciled
                ? 'Already reconciled by a finalized statement.'
                : undefined
          }
        >
          {status === 'cleared' ? 'Un-clear this line' : 'Mark cleared'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onViewRecord}>
          <ExternalLink data-icon="inline-start" />
          Open in Bank Transactions
        </Button>
      </div>
    </div>
  );
}
