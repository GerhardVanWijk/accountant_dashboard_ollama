import type { ReactNode } from 'react';
import type { ReconciliationHealth } from '../services';
import { Amount } from '@/components/app/figure';

/**
 * Two distinct questions, shown as two distinct figures (docs/CURRENT_TASKS.md #22):
 *  - "Match coverage" — did each imported bank line find its accounting side?
 *  - "Variance explained" — of the Rand gap, how much has a candidate cause?
 * Never a single "Explained %" that ignores the money gap.
 */
export function ReconciliationHealthCard({ health }: { health: ReconciliationHealth }) {
  const fullyExplained = health.varianceRemaining === 0;
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Transactions analysed" value={String(health.transactionsAnalysed)} />
        <Stat label="Confirmed" value={String(health.confirmed)} tone="positive" />
        <Stat label="Probable" value={String(health.probable)} tone="info" />
        <Stat label="Needs review" value={String(health.needsReview)} tone={health.needsReview > 0 ? 'warning' : 'default'} />
      </div>

      <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-3">
        <Stat
          label="Match coverage"
          value={health.matchCoveragePercent === null ? '—' : `${health.matchCoveragePercent}%`}
          hint={health.matchCoveragePercent === null ? 'No statement lines analysed' : `${health.confirmed + health.probable} of ${health.transactionsAnalysed} bank lines`}
        />
        <Stat
          label="Variance explained"
          value={`${health.varianceExplainedPercent}%`}
          tone={fullyExplained ? 'positive' : 'warning'}
          hint={<Amount value={health.varianceExplained} plain />}
        />
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Remaining unexplained</span>
          <Amount
            value={health.varianceRemaining}
            plain
            className={`text-xl font-semibold tabular-nums ${fullyExplained ? 'text-status-positive' : 'text-status-negative'}`}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
  hint,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'warning' | 'info';
  hint?: ReactNode;
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-status-positive'
      : tone === 'warning'
        ? 'text-status-warning'
        : tone === 'info'
          ? 'text-status-info'
          : 'text-foreground';
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className={`figure text-xl font-semibold tabular-nums ${toneClass}`}>{value}</span>
      {hint !== undefined ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}
