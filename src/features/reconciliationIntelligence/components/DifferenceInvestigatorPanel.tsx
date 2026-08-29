import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ID } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Amount } from '@/components/app/figure';
import type { ReconciliationIssue } from '@/types';
import { useDifferenceInvestigator } from '../hooks/useDifferenceInvestigator';
import type { InvestigationSections } from '../services';
import { selectIssuesForDisplay, filterIssuesByDate } from '../utils/issueSelectors';
import { ReconciliationHealthCard } from './ReconciliationHealthCard';
import { IssueCard } from './IssueCard';
import { DifferenceTimelinePanel } from './DifferenceTimelinePanel';

/** PART H — the sectioned view of an investigation result. */
const SECTION_ORDER: { key: keyof InvestigationSections; title: string; blurb: string }[] = [
  { key: 'exactCauses', title: 'Exact causes found', blurb: 'These account for the difference exactly.' },
  { key: 'strongCandidates', title: 'Strong candidates', blurb: 'High-confidence matches with a small discrepancy.' },
  { key: 'timingItems', title: 'Timing items', blurb: 'Recorded on one side but not yet the other — usually clears itself.' },
  { key: 'structuralIssues', title: 'Structural / bookkeeping issues', blurb: 'Duplicates, wrong signs, wrong accounts, VAT and opening-balance problems.' },
  { key: 'combinationExplanations', title: 'Combination explanations', blurb: 'Several smaller items that together equal the difference.' },
];

export interface DifferenceInvestigatorPanelProps {
  bankAccountId: ID;
  statementDate: string;
  statementBalance: number;
  clearedTransactionIds: ID[];
  variance: number;
  /** Bump this (e.g. from the workspace's "Investigate R…" button) to auto-run the investigation. */
  runSignal?: number;
  /**
   * When the page has already lifted `useDifferenceInvestigator` (so the
   * side-by-side workspace and this panel share ONE investigation result),
   * pass it here. Omitted → the panel keeps its own instance (backward
   * compatible with every existing consumer/test).
   */
  controller?: ReturnType<typeof useDifferenceInvestigator>;
}

/**
 * "You are out by RX.XX. Here's why." — the Difference Investigator screen.
 * Runs on demand against the workspace's current statement date/balance/
 * cleared selection, ranks every candidate cause by confidence, and shows
 * the timeline alongside it. Every action a card exposes goes through
 * reconciliationIssueResolutionService — see IssueCard's own doc comment.
 */
export function DifferenceInvestigatorPanel({ bankAccountId, statementDate, statementBalance, clearedTransactionIds, variance, runSignal, controller }: DifferenceInvestigatorPanelProps) {
  const own = useDifferenceInvestigator(bankAccountId);
  const { result, isInvestigating, error, investigate, reviewIssue, dismissIssue, markAutoSafe, resolveIssue } = controller ?? own;
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const runInvestigation = () => void investigate(statementDate, statementBalance, clearedTransactionIds);

  // Auto-run when triggered from the workspace ("Investigate R… difference").
  const lastRunSignal = useRef(runSignal);
  useEffect(() => {
    if (runSignal !== undefined && runSignal !== lastRunSignal.current && Math.abs(variance) >= 0.005) {
      lastRunSignal.current = runSignal;
      void investigate(statementDate, statementBalance, clearedTransactionIds);
    }
  }, [runSignal, variance, investigate, statementDate, statementBalance, clearedTransactionIds]);

  const { ranked: rankedIssues, settled: otherIssues } = result ? selectIssuesForDisplay(result.issues) : { ranked: [], settled: [] };
  const windowIssues = filterIssuesByDate(rankedIssues, selectedDate);

  return (
    <div className="flex flex-col gap-6">
      {Math.abs(variance) < 0.005 ? (
        <p className="text-sm text-muted-foreground">Nothing to investigate — this reconciliation is already balanced.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase">Unexplained difference</span>
            <Amount value={variance} className="text-3xl font-semibold" />
          </div>
          <div>
            <Button onClick={runInvestigation} disabled={isInvestigating}>
              {isInvestigating ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> Investigating…
                </>
              ) : (
                'Investigate'
              )}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-status-negative">{error.message}</p>}

      {result && !result.fullyExplained && (
        <>
          <ReconciliationHealthCard health={result.health} />

          {result.health.varianceRemaining === 0 && (
            <p className="rounded-lg border border-status-positive-outline bg-status-positive-surface px-3 py-2 text-sm text-status-positive">
              Every Rand of the difference now has a candidate cause below — review each and
              action it through the normal accounting flow. Nothing here is auto-applied.
            </p>
          )}

          {result.timeline.points.length > 0 && (
            <div className="rounded-xl border border-border p-4">
              <h3 className="mb-3 text-sm font-semibold">Difference timeline</h3>
              <DifferenceTimelinePanel timeline={result.timeline} onSelectDate={(date) => setSelectedDate((prev) => (prev === date ? null : date))} />
            </div>
          )}

          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Most likely causes {selectedDate ? `— ${selectedDate}` : ''}</h3>
              {selectedDate && (
                <Button size="sm" variant="ghost" onClick={() => setSelectedDate(null)}>
                  Clear date filter
                </Button>
              )}
            </div>
            {windowIssues.length === 0 && <p className="text-sm text-muted-foreground">No candidate causes found — this may be a genuine bank-timing gap or a data-entry issue not captured by any current pattern.</p>}

            {SECTION_ORDER.map(({ key, title, blurb }) => {
              const inSection = filterIssuesByDate(
                result.sections[key].filter((i) => i.status === 'open' || i.status === 'reviewed'),
                selectedDate,
              );
              if (inSection.length === 0) return null;
              return (
                <section key={key} className="flex flex-col gap-3">
                  <div className="flex flex-col gap-0.5">
                    <h4 className="text-sm font-semibold">{title}</h4>
                    <p className="text-xs text-muted-foreground">{blurb}</p>
                  </div>
                  {inSection.map((issue: ReconciliationIssue) => (
                    <IssueCard
                      key={`${key}-${issue.id}`}
                      issue={issue}
                      onReview={() => reviewIssue(issue.id)}
                      onDismiss={(reason) => dismissIssue(issue.id, reason)}
                      onMarkAutoSafe={() => markAutoSafe(issue.id)}
                      onResolve={(reason) => resolveIssue(issue.id, reason)}
                    />
                  ))}
                </section>
              );
            })}
          </div>

          {otherIssues.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-muted-foreground">Reviewed / dismissed / resolved</h3>
              {otherIssues.map((issue) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  onReview={() => reviewIssue(issue.id)}
                  onDismiss={(reason) => dismissIssue(issue.id, reason)}
                  onMarkAutoSafe={() => markAutoSafe(issue.id)}
                  onResolve={(reason) => resolveIssue(issue.id, reason)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {result?.fullyExplained && <p className="text-sm text-status-positive">Fully explained — no unexplained difference remains.</p>}
    </div>
  );
}
