import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Search } from 'lucide-react';
import type { BankAccount, BankStatement, BankStatementLine, ID, ReconciliationIssue } from '@/types';
import { Amount } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { EnumSelect } from '@/components/app/combobox';
import {
  RecordDetailField,
  RecordDetailSection,
  RecordDetailSheet,
} from '@/components/app/record-detail-sheet';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDate } from '@/lib/app/format';
import type { BankTransactionWithAllocations } from '../types';
import type { ReconciliationSummary } from '../services';
import type { InvestigationResult } from '@/features/reconciliationIntelligence/services';
import {
  buildComparison,
  buildProof,
  selectLineCandidates,
  signedLineAmount,
  type LineCounterpart,
} from '@/features/reconciliationIntelligence/utils/lineReconciliation';
import { EvidenceFactors } from '@/features/reconciliationIntelligence/components/EvidenceFactors';
import { HelpTip } from '@/features/reconciliationIntelligence/components/HelpTip';
import { RECON_TOOLTIPS, type ReconTooltipKey } from '@/features/reconciliationIntelligence/reconciliationTooltips';

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

/** The trace-everything targets — only the relationships that genuinely exist are offered. */
export type TraceRef =
  | { type: 'bank_transaction'; id: ID }
  | { type: 'journal_entry'; id: ID }
  | { type: 'statement_line'; id: ID };

/** The missing-in-books workflow actions (PART D). These OPEN existing flows; the workspace never writes GL. */
export type MissingInBooksAction =
  | 'bank_charge'
  | 'interest_income'
  | 'expense'
  | 'allocate_payment'
  | 'transfer'
  | 'search_existing';

export interface ReconciliationWorkspaceProps {
  bankAccount: BankAccount;
  transactions: BankTransactionWithAllocations[];
  /** The persisted statement this workspace is scoped to. */
  statement: BankStatement | null;
  /** Every `bank_statement_line` for the statement, in sequence order. */
  lines: BankStatementLine[];
  statementLoading?: boolean;
  /** The last investigation run for this account/window, if any — drives per-line evidence + the truthful summary. */
  investigation: InvestigationResult | null;
  /** GL account code/name for an allocation account id. */
  glAccountName?: (id: ID) => string;
  journalNumberFor?: (journalEntryId: ID) => string | undefined;
  journalBalancedFor?: (journalEntryId: ID) => boolean | undefined;

  // ---- shared reconciliation state (lifted to the page) ----
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

  /** Runs the Difference Investigator against the whole current variance. */
  onInvestigate: () => void;
  /** Runs the Difference Investigator, focused on one line (amount-mismatch "Investigate R0.16"). */
  onInvestigateLine: (line: BankStatementLine) => void;
  /** Opens the real GL allocation flow for a matched, un-coded transaction. */
  onAllocate: (txn: BankTransactionWithAllocations) => void;
  /** Opens the Bank Transactions register focused on this record. */
  onViewRecord: (id: string) => void;
  /** Opens one of the missing-in-books workflows (existing flows; some are `// P2` on the page). */
  onMissingInBooksAction: (action: MissingInBooksAction, line: BankStatementLine) => void;
}

type LineDisplayState = 'confirmed' | 'probable' | 'needs-review' | 'missing' | 'explained' | 'ignored' | 'unmatched';

const STATE_META: Record<LineDisplayState, { label: string; className: string; tip: ReconTooltipKey }> = {
  confirmed: { label: 'Confirmed', className: 'bg-status-positive-muted text-status-positive', tip: 'confirmed' },
  probable: { label: 'Probable', className: 'bg-status-info-muted text-status-info', tip: 'probable' },
  'needs-review': { label: 'Needs review', className: 'bg-status-warning-muted text-status-warning', tip: 'needsReview' },
  missing: { label: 'Missing in books', className: 'bg-status-negative-muted text-status-negative', tip: 'missingInBooks' },
  explained: { label: 'Explained', className: 'bg-brand-muted text-brand', tip: 'explained' },
  ignored: { label: 'Ignored', className: 'bg-muted text-muted-foreground', tip: 'ignored' },
  unmatched: { label: 'Unmatched', className: 'bg-muted text-muted-foreground', tip: 'unmatched' },
};

const VERDICT_MARK: Record<string, string> = { ok: '✓', warn: '⚠', bad: '✗', na: '–' };
const VERDICT_CLASS: Record<string, string> = {
  ok: 'text-status-positive',
  warn: 'text-status-warning',
  bad: 'text-status-negative',
  na: 'text-muted-foreground',
};

function deriveCounterpart(
  line: BankStatementLine,
  transactions: BankTransactionWithAllocations[],
  glAccountName?: (id: ID) => string,
  journalNumberFor?: (id: ID) => string | undefined,
  journalBalancedFor?: (id: ID) => boolean | undefined,
): LineCounterpart | null {
  const txn =
    (line.matchedBankTransactionId && transactions.find((t) => t.id === line.matchedBankTransactionId)) ||
    transactions.find((t) => t.bankStatementLineId === line.id) ||
    null;
  if (!txn) return null;

  const amountSigned = txn.direction === 'debit' ? txn.amount : -txn.amount;
  const glAccountLabels = txn.allocations.map((a) => glAccountName?.(a.glAccountId) ?? a.description ?? a.glAccountId);
  const vatAmount = txn.allocations.reduce((s, a) => s + a.taxAmount, 0);

  return {
    sourceLabel:
      txn.source === 'import' ? 'Imported bank transaction' : txn.source === 'transfer' ? 'Inter-account transfer' : 'Recorded transaction',
    sourceNumber: txn.reference,
    contact: txn.category,
    accountingDate: txn.date,
    reference: txn.reference,
    amountSigned,
    direction: txn.direction,
    glAccountLabels,
    journalNumber: txn.journalEntryId ? journalNumberFor?.(txn.journalEntryId) : undefined,
    journalEntryId: txn.journalEntryId,
    bankTransactionId: txn.id,
    vatAmount,
    status: txn.status,
    reconciliationState: txn.reconciliationId ? 'Reconciled' : txn.status === 'matched' ? 'Matched, not finalized' : 'Not reconciled',
    journalBalanced: txn.journalEntryId ? journalBalancedFor?.(txn.journalEntryId) : undefined,
  };
}

/**
 * The engine's own deltas for the selected line's top candidate — fed into
 * `buildComparison` / `buildProof` so the Reference verdict comes from
 * `evidenceData.referenceSimilarity` (PART B item 3) and the amount / date
 * rows show the investigator's measured difference rather than a re-derived one.
 */
function evidenceHints(row: Row): { referenceSimilarity?: number; amountDifferenceCents?: number; dateDifferenceDays?: number } {
  const ed = row.candidates[0]?.evidenceData;
  if (!ed) return {};
  return {
    referenceSimilarity: ed.referenceSimilarity,
    amountDifferenceCents: ed.amountDifferenceCents,
    dateDifferenceDays: ed.dateDifferenceDays,
  };
}

function deriveDisplayState(line: BankStatementLine, counterpart: LineCounterpart | null, candidates: ReconciliationIssue[]): LineDisplayState {
  if (line.lineState === 'ignored') return 'ignored';
  if (counterpart) return candidates.some((c) => c.status === 'open' || c.status === 'reviewed') ? 'probable' : 'confirmed';
  if (candidates.some((c) => c.issueType === 'missing_ledger_side')) return 'missing';
  if (line.lineState === 'explained') return 'explained';
  if (candidates.length > 0) return 'needs-review';
  return 'unmatched';
}

export function ReconciliationWorkspace(props: ReconciliationWorkspaceProps) {
  const {
    bankAccount,
    transactions,
    statement,
    lines,
    statementLoading,
    investigation,
    glAccountName,
    journalNumberFor,
    journalBalancedFor,
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
    onInvestigateLine,
    onAllocate,
    onViewRecord,
    onMissingInBooksAction,
  } = props;

  const [density, setDensity] = useState<Density>(readDensity);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<LineDisplayState | 'all'>('all');
  const [notes, setNotes] = useState('');
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [traced, setTraced] = useState<TraceRef | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(DENSITY_KEY, density);
    } catch {
      /* private window — density just won't persist */
    }
  }, [density]);

  const issues = useMemo(() => investigation?.issues ?? [], [investigation]);

  const rows = useMemo(
    () =>
      lines.map((line) => {
        const counterpart = deriveCounterpart(line, transactions, glAccountName, journalNumberFor, journalBalancedFor);
        const candidates = selectLineCandidates(issues, line);
        return { line, counterpart, candidates, state: deriveDisplayState(line, counterpart, candidates) };
      }),
    [lines, transactions, issues, glAccountName, journalNumberFor, journalBalancedFor],
  );

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (stateFilter !== 'all' && r.state !== stateFilter) return false;
      if (!needle) return true;
      return (
        r.line.description.toLowerCase().includes(needle) ||
        (r.line.reference ?? '').toLowerCase().includes(needle) ||
        String(r.line.amount).includes(needle)
      );
    });
  }, [rows, search, stateFilter]);

  const selectedIndex = filteredRows.findIndex((r) => r.line.id === selectedLineId);
  const selectedRow = selectedIndex >= 0 ? filteredRows[selectedIndex] : null;

  const stateCounts = useMemo(() => {
    const c: Record<LineDisplayState, number> = {
      confirmed: 0,
      probable: 0,
      'needs-review': 0,
      missing: 0,
      explained: 0,
      ignored: 0,
      unmatched: 0,
    };
    for (const r of rows) c[r.state] += 1;
    return c;
  }, [rows]);

  function move(delta: number) {
    if (filteredRows.length === 0) return;
    const base = selectedIndex >= 0 ? selectedIndex : 0;
    const next = Math.min(filteredRows.length - 1, Math.max(0, base + delta));
    setSelectedLineId(filteredRows[next].line.id);
  }

  const listRef = useRef<HTMLDivElement>(null);
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      move(-1);
    }
  }

  const health = investigation?.health ?? null;
  const closing = statement?.closingBalance ?? summary?.statementBalance ?? null;
  const books = summary?.glCashbookBalance ?? health?.booksBankBalance ?? null;
  const diff = closing !== null && books !== null ? Math.round((closing - books) * 100) / 100 : (summary?.variance ?? 0);

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

  const canFinalize = Boolean(summary?.isBalanced) && (summary?.unallocatedItems.length ?? 1) === 0 && clearedIds.size > 0;
  const rowPad = density === 'compact' ? 'py-1.5' : 'py-2.5';

  if (!statement && !statementLoading) {
    return (
      <div className="rounded-xl border border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No imported statement for {bankAccount.name}. Import a bank statement, then reconcile it line by line.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" onKeyDown={onKeyDown}>
      {/* ---- Header: statement vs books + variance ---- */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="recon-statement-date">Reconcile up to</FieldLabel>
            <Input id="recon-statement-date" type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="recon-statement-balance">
              Statement closing balance <HelpTip tip="statementClosingBalance" />
            </FieldLabel>
            <Input
              id="recon-statement-balance"
              type="number"
              step="0.01"
              value={statementBalance || ''}
              onChange={(e) => setStatementBalance(parseFloat(e.target.value) || 0)}
            />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">
              Books bank balance <HelpTip tip="booksBankBalance" />
            </span>
            <div className="figure flex h-8 items-center rounded-lg border border-input bg-muted/30 px-2.5 text-sm tabular-nums">
              {books !== null ? <Amount value={books} plain /> : '—'}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">
              Statement vs books <HelpTip tip="statementVsBooksDifference" />
            </span>
            <div
              className={cn(
                'figure flex h-8 items-center rounded-lg border px-2.5 text-sm font-semibold tabular-nums',
                Math.abs(diff) < 0.005
                  ? 'border-status-positive-outline bg-status-positive-surface text-status-positive'
                  : 'border-status-negative-outline bg-status-negative-surface text-status-negative',
              )}
            >
              <Amount value={diff} plain />
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <WorkspaceSummary health={health} counts={stateCounts} statement={statement} />
          <div className="flex flex-wrap items-center gap-2">
            {Math.abs(diff) >= 0.005 && (
              <Button size="sm" variant="outline" onClick={onInvestigate}>
                <Search data-icon="inline-start" />
                Investigate {formatCurrency(diff)} difference
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
      {(isLoading || statementLoading) && <p className="text-sm text-muted-foreground">Loading…</p>}

      {/* ---- Two-pane workspace ---- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* LEFT — statement lines + selected-line detail */}
        <div className="flex flex-col gap-4">
          <div ref={listRef} className="flex flex-col rounded-xl border border-border">
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter statement lines…"
                aria-label="Filter statement lines"
                className="h-7 min-w-32 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <EnumSelect
                aria-label="Filter by state"
                value={stateFilter}
                onValueChange={(value) => setStateFilter(value as LineDisplayState | 'all')}
                className="h-7 w-auto min-w-36 text-xs"
                options={[
                  { value: 'all', label: 'All states' },
                  ...(Object.keys(STATE_META) as LineDisplayState[]).map((s) => ({
                    value: s,
                    label: `${STATE_META[s].label} (${stateCounts[s]})`,
                  })),
                ]}
              />
              <span className="shrink-0 text-xs text-muted-foreground">{filteredRows.length}</span>
            </div>
            <div className="app-scroll max-h-[28rem] overflow-y-auto">
              {filteredRows.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No statement lines match this filter.</p>
              ) : (
                <ul>
                  {filteredRows.map((r) => {
                    const active = r.line.id === selectedLineId;
                    const meta = STATE_META[r.state];
                    return (
                      <li key={r.line.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedLineId(r.line.id)}
                          className={cn(
                            'flex w-full items-center gap-3 border-b border-l-2 border-border/60 px-3 text-left text-sm transition-colors',
                            rowPad,
                            active ? 'border-l-brand bg-muted/50' : 'border-l-transparent hover:bg-muted/30',
                          )}
                        >
                          <span className="w-16 shrink-0 text-xs text-muted-foreground">{formatDate(r.line.txnDate)}</span>
                          <span className="min-w-0 flex-1 truncate">
                            {r.line.description}
                            {density === 'comfortable' && r.line.reference ? (
                              <span className="ml-2 font-mono text-xs text-muted-foreground">{r.line.reference}</span>
                            ) : null}
                          </span>
                          <span className={cn('hidden shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium sm:inline', meta.className)}>
                            {meta.label}
                          </span>
                          <span className="w-24 shrink-0 text-right tabular-nums">
                            <Amount value={signedLineAmount(r.line)} plain />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {selectedRow ? (
            <LineDetailPanel
              row={selectedRow}
              statement={statement}
              position={{ current: selectedRow.line.sequence, total: statement?.lineCount ?? lines.length }}
              onPrev={() => move(-1)}
              onNext={() => move(1)}
              onTrace={() => setTraced({ type: 'statement_line', id: selectedRow.line.id })}
            />
          ) : (
            <div className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
              Select a statement line to see its detail, its accounting counterpart, and the comparison.
            </div>
          )}
        </div>

        {/* RIGHT — the accounting counterpart + comparison + evidence + proof */}
        <div className="flex flex-col gap-4">
          {!selectedRow ? (
            <div className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
              The accounting side appears here once a line is selected.
            </div>
          ) : (
            <>
              <CounterpartPanel
                key={selectedRow.line.id}
                row={selectedRow}
                onAllocate={(txn) => onAllocate(txn)}
                onViewRecord={onViewRecord}
                onInvestigateLine={() => onInvestigateLine(selectedRow.line)}
                onMissingInBooksAction={(a) => onMissingInBooksAction(a, selectedRow.line)}
                onTraceTxn={(id) => setTraced({ type: 'bank_transaction', id })}
                onTraceJournal={(id) => setTraced({ type: 'journal_entry', id })}
                transactions={transactions}
                clearedIds={clearedIds}
                toggleCleared={toggleCleared}
              />
              <ComparisonBlock row={selectedRow} />
              <CandidateEvidenceList row={selectedRow} />
              <ProofChecklist row={selectedRow} investigation={investigation} />
            </>
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
                : 'Clear the outstanding items and reach a zero difference to finalize.'}
            </p>
            <Button disabled={!canFinalize || isFinalizing} onClick={() => void handleFinalize()}>
              {isFinalizing ? 'Finalizing…' : `Finalize ${bankAccount.name}`}
            </Button>
          </div>
        </div>
      </div>

      <TraceSheet
        traced={traced}
        onClose={() => setTraced(null)}
        rows={rows}
        transactions={transactions}
        journalNumberFor={journalNumberFor}
        onViewRecord={onViewRecord}
      />
    </div>
  );
}

function WorkspaceSummary({
  health,
  counts,
  statement,
}: {
  health: InvestigationResult['health'] | null;
  counts: Record<LineDisplayState, number>;
  statement: BankStatement | null;
}) {
  const lineCount = statement?.lineCount ?? Object.values(counts).reduce((a, b) => a + b, 0);
  const coverage = health?.matchCoveragePercent ?? null;
  const explained = health ? (health.varianceRemaining === 0 ? health.varianceExplainedPercent : Math.min(99.9, health.varianceExplainedPercent)) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <span className="font-medium">
        {lineCount} statement lines <HelpTip tip="statementLineCount" />
      </span>
      <span className="text-status-positive">{counts.confirmed} confirmed</span>
      <span className="text-status-info">{counts.probable} probable</span>
      <span className={counts['needs-review'] > 0 ? 'text-status-warning' : 'text-muted-foreground'}>{counts['needs-review']} needs review</span>
      <span className="text-muted-foreground">
        Match coverage <HelpTip tip="matchCoverage" />: {coverage === null ? '—' : `${coverage}%`}
      </span>
      {health && (
        <>
          <span className="text-muted-foreground">
            Variance explained <HelpTip tip="varianceExplained" />: {explained === null ? '—' : `${explained}%`}
          </span>
          <span className={health.varianceRemaining === 0 ? 'text-status-positive' : 'text-status-negative'}>
            Remaining <HelpTip tip="varianceRemaining" />: {formatCurrency(health.varianceRemaining)}
          </span>
        </>
      )}
    </div>
  );
}

type Row = { line: BankStatementLine; counterpart: LineCounterpart | null; candidates: ReconciliationIssue[]; state: LineDisplayState };

function LineDetailPanel({
  row,
  statement,
  position,
  onPrev,
  onNext,
  onTrace,
}: {
  row: Row;
  statement: BankStatement | null;
  position: { current: number; total: number };
  onPrev: () => void;
  onNext: () => void;
  onTrace: () => void;
}) {
  const { line } = row;
  const meta = STATE_META[row.state];
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          Line {position.current} of {position.total}
        </span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={onPrev} aria-label="Previous line">
            <ChevronLeft className="size-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={onNext} aria-label="Next line">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <button type="button" onClick={onTrace} className="text-left text-sm font-semibold hover:underline">
            {line.description}
          </button>
          <span className="text-xs text-muted-foreground">Bank statement line</span>
        </div>
        <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium', meta.className)} title={RECON_TOOLTIPS[meta.tip]}>
          {meta.label}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <RecordDetailField label="Date" value={formatDate(line.txnDate)} />
        <RecordDetailField label="Value date" value={line.valueDate ? formatDate(line.valueDate) : '—'} />
        <RecordDetailField label="Reference" value={<span className="font-mono">{line.reference ?? '—'}</span>} />
        <RecordDetailField label="Direction" value={line.direction === 'debit' ? 'Money in' : 'Money out'} />
        <RecordDetailField label="Amount" value={<Amount value={signedLineAmount(line)} plain />} />
        <RecordDetailField label="Running balance" value={line.runningBalance !== undefined ? <Amount value={line.runningBalance} plain /> : '—'} />
        <RecordDetailField label="Statement" value={statement?.sourceFilename ?? statement?.reference ?? 'Imported statement'} className="col-span-2" />
      </dl>
    </div>
  );
}

function CounterpartPanel({
  row,
  transactions,
  clearedIds,
  toggleCleared,
  onAllocate,
  onViewRecord,
  onInvestigateLine,
  onMissingInBooksAction,
  onTraceTxn,
  onTraceJournal,
}: {
  row: Row;
  transactions: BankTransactionWithAllocations[];
  clearedIds: Set<string>;
  toggleCleared: (id: string) => void;
  onAllocate: (txn: BankTransactionWithAllocations) => void;
  onViewRecord: (id: string) => void;
  onInvestigateLine: () => void;
  onMissingInBooksAction: (a: MissingInBooksAction) => void;
  onTraceTxn: (id: ID) => void;
  onTraceJournal: (id: ID) => void;
}) {
  const { line, counterpart } = row;
  const comparison = buildComparison({ line, counterpart, ...evidenceHints(row) });
  const amountRow = comparison.find((c) => c.key === 'amount');

  if (!counterpart) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-status-negative-outline bg-status-negative-surface/40 p-4">
        <p className="text-sm font-medium text-status-negative">
          The bank shows this transaction, but Vertex cannot find a corresponding accounting entry.
        </p>
        <p className="text-xs text-muted-foreground">Record it through one of the normal flows — nothing is posted from this screen.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => onMissingInBooksAction('bank_charge')}>
            Create bank charge
          </Button>
          <Button size="sm" variant="outline" onClick={() => onMissingInBooksAction('interest_income')}>
            Create interest income
          </Button>
          <Button size="sm" variant="outline" onClick={() => onMissingInBooksAction('expense')}>
            Create expense
          </Button>
          <Button size="sm" variant="outline" onClick={() => onMissingInBooksAction('allocate_payment')}>
            Allocate to a payment
          </Button>
          <Button size="sm" variant="outline" onClick={() => onMissingInBooksAction('transfer')}>
            Create transfer
          </Button>
          <Button size="sm" variant="outline" onClick={() => onMissingInBooksAction('search_existing')}>
            Search existing entries
          </Button>
        </div>
      </div>
    );
  }

  const txn = counterpart.bankTransactionId ? transactions.find((t) => t.id === counterpart.bankTransactionId) : undefined;
  const isCleared = counterpart.bankTransactionId ? clearedIds.has(counterpart.bankTransactionId) : false;
  const notCoded = counterpart.glAccountLabels.length === 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => counterpart.bankTransactionId && onTraceTxn(counterpart.bankTransactionId)}
            className="text-left text-sm font-semibold hover:underline"
          >
            {counterpart.sourceLabel}
            {counterpart.sourceNumber ? ` · ${counterpart.sourceNumber}` : ''}
          </button>
          <span className="text-xs text-muted-foreground">Vertex believes this matches the bank line</span>
        </div>
        <Amount value={counterpart.amountSigned} className="shrink-0 text-lg font-semibold" />
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <RecordDetailField label="Accounting date" value={counterpart.accountingDate ? formatDate(counterpart.accountingDate) : '—'} />
        <RecordDetailField label="Reference" value={<span className="font-mono">{counterpart.reference ?? '—'}</span>} />
        <RecordDetailField label="Contact / category" value={counterpart.contact ?? '—'} />
        <RecordDetailField label="Status" value={counterpart.status ?? '—'} />
        <RecordDetailField
          label="GL account"
          value={counterpart.glAccountLabels.length > 0 ? counterpart.glAccountLabels.join(', ') : <span className="text-status-warning">Not yet coded</span>}
        />
        <RecordDetailField
          label="Journal"
          value={
            counterpart.journalEntryId ? (
              <button type="button" onClick={() => onTraceJournal(counterpart.journalEntryId!)} className="font-mono hover:underline">
                {counterpart.journalNumber ?? 'View journal'}
              </button>
            ) : (
              '—'
            )
          }
        />
        <RecordDetailField label="VAT" value={counterpart.vatAmount !== 0 ? <Amount value={counterpart.vatAmount} plain /> : 'None'} />
        <RecordDetailField label="Reconciliation state" value={counterpart.reconciliationState} />
      </dl>

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        {counterpart.bankTransactionId && (
          <Button
            size="sm"
            variant={isCleared ? 'default' : 'outline'}
            onClick={() => toggleCleared(counterpart.bankTransactionId!)}
            disabled={notCoded}
            title={notCoded ? 'Code this transaction to a GL account before confirming the match.' : undefined}
          >
            {isCleared ? 'Match confirmed — undo' : 'Confirm match'}
          </Button>
        )}
        {txn && notCoded && (
          <Button size="sm" variant="outline" onClick={() => onAllocate(txn)}>
            Code to a GL account
          </Button>
        )}
        {amountRow?.verdict === 'bad' && (
          <Button size="sm" variant="outline" onClick={onInvestigateLine}>
            Investigate {amountRow.delta}
          </Button>
        )}
        {counterpart.bankTransactionId && (
          <Button size="sm" variant="ghost" onClick={() => onViewRecord(counterpart.bankTransactionId!)}>
            <ExternalLink data-icon="inline-start" />
            Open in Bank Transactions
          </Button>
        )}
      </div>
    </div>
  );
}

function ComparisonBlock({ row }: { row: Row }) {
  const rows = buildComparison({ line: row.line, counterpart: row.counterpart, ...evidenceHints(row) });
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Comparison</h3>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((c) => (
            <tr key={c.key} className="border-b border-border/50 last:border-0">
              <td className="py-1.5 pr-2 text-muted-foreground">{c.label}</td>
              <td className="py-1.5 pr-2 tabular-nums">{c.statementValue}</td>
              <td className="py-1.5 pr-2 tabular-nums">{c.booksValue}</td>
              <td className={cn('py-1.5 text-right', VERDICT_CLASS[c.verdict])}>
                <span aria-hidden="true">{VERDICT_MARK[c.verdict]}</span> {c.delta}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CandidateEvidenceList({ row }: { row: Row }) {
  if (row.candidates.length === 0) return null;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Ranked candidates</h3>
      {row.candidates.map((issue) => {
        const ed = issue.evidenceData;
        const explains = issue.effectAmount ? `Explains ${formatCurrency(Math.abs(issue.effectAmount))} of the variance` : null;
        return (
          <div key={issue.id} className="flex flex-col gap-2 rounded-lg border border-border/70 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {issue.relatedSourceDocumentIds[0] ?? issue.relatedJournalEntryIds[0] ?? issue.relatedBankTransactionIds[0] ?? issue.issueType}
              </span>
              <span className="text-xs text-muted-foreground">
                {issue.confidence}% confidence
                {ed?.confidenceMax ? ` (${issue.evidence.length ? `${(ed.factors ?? []).filter((f) => f.met).length} of ${(ed.factors ?? []).length} factors` : ''})` : ''}
              </span>
            </div>
            {ed?.factors && ed.factors.length > 0 ? (
              <EvidenceFactors factors={ed.factors} />
            ) : (
              <p className="text-xs text-muted-foreground">{issue.explanation}</p>
            )}
            {explains && <p className="text-xs text-muted-foreground">{explains}</p>}
            {typeof ed?.amountDifferenceCents === 'number' && ed.amountDifferenceCents !== 0 && (
              <p className="text-xs text-muted-foreground">Amount difference: R{Math.abs(ed.amountDifferenceCents / 100).toFixed(2)}</p>
            )}
            {typeof ed?.dateDifferenceDays === 'number' && ed.dateDifferenceDays !== 0 && (
              <p className="text-xs text-muted-foreground">
                Statement date differs from the accounting date by {Math.abs(ed.dateDifferenceDays)} day{Math.abs(ed.dateDifferenceDays) === 1 ? '' : 's'}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProofChecklist({ row, investigation }: { row: Row; investigation: InvestigationResult | null }) {
  const hasBooksOnly = investigation
    ? (investigation.timeline?.points?.length ?? 0) > 0 || (investigation.sections?.timingItems?.length ?? 0) > 0
    : undefined;
  const items = buildProof({ line: row.line, counterpart: row.counterpart, hasBooksOnlyEntries: hasBooksOnly, ...evidenceHints(row) });
  const mark: Record<string, string> = { yes: '✓', no: '✗', na: '–' };
  const cls: Record<string, string> = { yes: 'text-status-positive', no: 'text-status-negative', na: 'text-muted-foreground' };
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Proof</h3>
      <ul className="flex flex-col gap-1.5 text-sm">
        {items.map((it) => (
          <li key={it.key} className="flex items-start gap-2">
            <span className={cn('shrink-0 font-semibold', cls[it.answer])} aria-hidden="true">
              {mark[it.answer]}
            </span>
            <span className="flex-1">
              {it.question}
              {it.detail ? <span className="block text-xs text-muted-foreground">{it.detail}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TraceSheet({
  traced,
  onClose,
  rows,
  transactions,
  journalNumberFor,
  onViewRecord,
}: {
  traced: TraceRef | null;
  onClose: () => void;
  rows: Row[];
  transactions: BankTransactionWithAllocations[];
  journalNumberFor?: (id: ID) => string | undefined;
  onViewRecord: (id: string) => void;
}) {
  let title = 'Record';
  let body: React.ReactNode = null;
  let actions: React.ReactNode = null;

  if (traced?.type === 'statement_line') {
    const row = rows.find((r) => r.line.id === traced.id);
    if (row) {
      title = 'Statement line';
      body = (
        <RecordDetailSection title="Bank statement line">
          <RecordDetailField label="Description" value={row.line.description} />
          <RecordDetailField label="Date" value={formatDate(row.line.txnDate)} />
          <RecordDetailField label="Amount" value={<Amount value={signedLineAmount(row.line)} plain />} />
          <RecordDetailField label="Matched transaction" value={row.line.matchedBankTransactionId ?? 'None'} />
        </RecordDetailSection>
      );
    }
  } else if (traced?.type === 'bank_transaction') {
    const txn = transactions.find((t) => t.id === traced.id);
    if (txn) {
      title = 'Bank transaction';
      body = (
        <RecordDetailSection title="Bank transaction">
          <RecordDetailField label="Description" value={txn.description} />
          <RecordDetailField label="Date" value={formatDate(txn.date)} />
          <RecordDetailField label="Amount" value={<Amount value={txn.direction === 'debit' ? txn.amount : -txn.amount} plain />} />
          <RecordDetailField label="Journal" value={txn.journalEntryId ? (journalNumberFor?.(txn.journalEntryId) ?? txn.journalEntryId) : 'Not posted'} />
          <RecordDetailField label="Allocations" value={txn.allocations.length > 0 ? `${txn.allocations.length} line(s)` : 'None'} />
        </RecordDetailSection>
      );
      actions = (
        <Button size="sm" variant="outline" onClick={() => onViewRecord(txn.id)}>
          Open in Bank Transactions
        </Button>
      );
    }
  } else if (traced?.type === 'journal_entry') {
    title = 'Journal entry';
    body = (
      <RecordDetailSection title="Journal entry">
        <RecordDetailField label="Journal" value={journalNumberFor?.(traced.id) ?? traced.id} />
        <p className="text-xs text-muted-foreground">Open the General Ledger to see the full posting.</p>
      </RecordDetailSection>
    );
  }

  return (
    <RecordDetailSheet open={traced !== null} onOpenChange={(o) => !o && onClose()} title={title} state={body ? 'ready' : 'not-found'} actions={actions}>
      {body}
    </RecordDetailSheet>
  );
}
