import { useState } from 'react';
import type { ReconciliationIssue } from '@/types';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { StatusBadge } from '@/components/app/status-badge';
import { Amount } from '@/components/app/figure';
import { formatDate } from '@/lib/app/format';
import { EvidenceFactors } from './EvidenceFactors';

/** "R95.00 + R310.40 = R405.40" — the literal arithmetic behind a combination / rounding issue. */
function combinationArithmetic(terms: { label: string; amountCents: number }[], totalCents?: number): string {
  const parts = terms.map((t) => `R${Math.abs(t.amountCents / 100).toFixed(2)}`);
  const total = totalCents ?? terms.reduce((s, t) => s + t.amountCents, 0);
  return `${parts.join(' + ')} = R${Math.abs(total / 100).toFixed(2)}`;
}

const SEVERITY_LABEL: Record<ReconciliationIssue['severity'], string> = {
  info: 'Info',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

const ISSUE_TYPE_LABEL: Record<ReconciliationIssue['issueType'], string> = {
  date_offset_timing: 'Timing difference',
  amount_mismatch: 'Amount mismatch',
  transposition_error: 'Possible transposition error',
  duplicate_transaction: 'Possible duplicate',
  missing_bank_side: 'Not yet on the bank statement',
  missing_ledger_side: 'Missing accounting entry',
  grouped_match: 'Grouped match',
  combination_match: 'Combination explains the difference',
  wrong_sign: 'Possible debit/credit reversal',
  wrong_bank_account: 'Possible wrong bank account',
  vat_difference: 'Possible VAT difference',
  rounding_variance: 'Accumulated rounding',
  opening_balance_discrepancy: 'Predates this period',
  edited_after_reconciliation: 'Edited after reconciliation',
};

export interface IssueCardProps {
  issue: ReconciliationIssue;
  onReview: () => Promise<void>;
  onDismiss: (reason: string) => Promise<void>;
  onMarkAutoSafe: () => Promise<void>;
  onResolve: (reason: string) => Promise<void>;
}

/** One ranked candidate explanation — the Difference Investigator's core UI unit. Every action requires the same reasoning a human would need: nothing here silently changes accounting history. */
export function IssueCard({ issue, onReview, onDismiss, onMarkAutoSafe, onResolve }: IssueCardProps) {
  const [reasonMode, setReasonMode] = useState<'dismiss' | 'resolve' | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submitReason = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      if (reasonMode === 'dismiss') await onDismiss(reason);
      else if (reasonMode === 'resolve') await onResolve(reason);
      setReasonMode(null);
      setReason('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{ISSUE_TYPE_LABEL[issue.issueType]}</span>
            <Badge variant="outline">{SEVERITY_LABEL[issue.severity]}</Badge>
            <StatusBadge status={issue.status} />
          </div>
          <p className="text-sm text-muted-foreground">{issue.explanation}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs font-medium text-muted-foreground">{issue.confidence}% confidence</span>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${issue.confidence}%` }} />
          </div>
        </div>
      </div>

      {issue.effectAmount !== 0 && (
        <div className="text-sm">
          Effect: <Amount value={issue.effectAmount} plain />
        </div>
      )}

      {issue.evidenceData?.combinationTerms && issue.evidenceData.combinationTerms.length > 0 && (
        <p className="figure rounded-md bg-muted/50 px-2 py-1 text-sm tabular-nums" data-testid="combination-arithmetic">
          {combinationArithmetic(issue.evidenceData.combinationTerms, issue.evidenceData.combinationTotalCents)}
        </p>
      )}

      {issue.evidenceData?.factors && issue.evidenceData.factors.length > 0 ? (
        <EvidenceFactors factors={issue.evidenceData.factors} />
      ) : (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Why we think this:</p>
          <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            {issue.evidence.map((e, i) => (
              <li key={i}>
                • {e.label}
                {e.detail ? ` — ${e.detail}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Suggested: {issue.suggestedResolution}
        {issue.affectedDateFrom ? ` (${formatDate(issue.affectedDateFrom)}${issue.affectedDateTo && issue.affectedDateTo !== issue.affectedDateFrom ? ` – ${formatDate(issue.affectedDateTo)}` : ''})` : ''}
      </p>

      {issue.status === 'open' && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void onReview()}>
            Review
          </Button>
          {issue.autoResolutionSafe && (
            <Button size="sm" onClick={() => void onMarkAutoSafe()}>
              Confirm — resolve
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setReasonMode('resolve')}>
            Resolve (already corrected)
          </Button>
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setReasonMode('dismiss')}>
            Not the cause
          </Button>
        </div>
      )}

      {issue.status === 'reviewed' && (
        <div className="flex flex-wrap items-center gap-2">
          {issue.autoResolutionSafe && (
            <Button size="sm" onClick={() => void onMarkAutoSafe()}>
              Confirm — resolve
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setReasonMode('resolve')}>
            Resolve (already corrected)
          </Button>
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setReasonMode('dismiss')}>
            Not the cause
          </Button>
        </div>
      )}

      {(issue.status === 'dismissed' || issue.status === 'resolved') && issue.resolutionReason && (
        <p className="text-xs text-muted-foreground italic">
          {issue.status === 'resolved' ? 'Resolved' : 'Dismissed'}: {issue.resolutionReason}
        </p>
      )}

      {reasonMode && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <Textarea
            placeholder={reasonMode === 'dismiss' ? 'Why is this not the cause?' : 'What was corrected, and how?'}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
          />
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={!reason.trim() || busy} onClick={() => void submitReason()}>
              {reasonMode === 'dismiss' ? 'Confirm dismissal' : 'Confirm resolution'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setReasonMode(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
