import type { ReconciliationIssue } from '@/types';

export interface IssueSelection {
  /** Still-actionable issues (open/reviewed), highest confidence first. */
  ranked: ReconciliationIssue[];
  /** Already triaged by a human (dismissed/resolved) — shown separately, never re-ranked by confidence. */
  settled: ReconciliationIssue[];
}

/**
 * Splits and ranks an investigation's issues for display — extracted out of
 * DifferenceInvestigatorPanel.tsx (a review found this filter/sort logic
 * living inside the component) so it's unit-testable independent of React
 * and reusable if another surface ever needs the same "actionable vs.
 * already-settled" split.
 */
export function selectIssuesForDisplay(issues: ReconciliationIssue[]): IssueSelection {
  const ranked = issues.filter((i) => i.status === 'open' || i.status === 'reviewed').sort((a, b) => b.confidence - a.confidence);
  const settled = issues.filter((i) => i.status === 'dismissed' || i.status === 'resolved');
  return { ranked, settled };
}

/** Narrows a ranked issue list to only those whose affected-date window covers `date`. */
export function filterIssuesByDate(issues: ReconciliationIssue[], date: string | null): ReconciliationIssue[] {
  if (!date) return issues;
  return issues.filter((i) => i.affectedDateFrom && i.affectedDateTo && date >= i.affectedDateFrom && date <= i.affectedDateTo);
}
