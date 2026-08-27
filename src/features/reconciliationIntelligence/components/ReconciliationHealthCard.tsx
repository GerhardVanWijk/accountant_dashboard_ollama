import type { ReconciliationHealth } from '../services';
import { Amount } from '@/components/app/figure';

export function ReconciliationHealthCard({ health }: { health: ReconciliationHealth }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
      <Stat label="Bank transactions" value={String(health.totalBankTransactions)} />
      <Stat label="Confirmed" value={String(health.confirmed)} tone="positive" />
      <Stat label="Probable" value={String(health.probable)} tone="info" />
      <Stat label="Needs review" value={String(health.needsReview)} tone="warning" />
      <Stat label="Explained" value={`${health.explainedPercent}%`} tone={health.explainedPercent >= 99.5 ? 'positive' : 'warning'} />
      {health.unexplainedAmount !== 0 && (
        <div className="col-span-2 flex flex-col gap-1 sm:col-span-5">
          <span className="text-xs font-medium text-muted-foreground uppercase">Unexplained difference</span>
          <Amount value={health.unexplainedAmount} className="text-2xl font-semibold" />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'positive' | 'warning' | 'info' }) {
  const toneClass = tone === 'positive' ? 'text-status-positive' : tone === 'warning' ? 'text-status-warning' : tone === 'info' ? 'text-status-info' : 'text-foreground';
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground uppercase">{label}</span>
      <span className={`figure text-xl font-semibold tabular-nums ${toneClass}`}>{value}</span>
    </div>
  );
}
