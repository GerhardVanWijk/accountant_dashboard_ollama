import { Movement } from '@/components/app/figure';
import { cn } from '@/lib/utils';

/**
 * Adapted from accounting-v0-frontend/components/app/metric-card.tsx. v0's
 * version took a `Metric` (mock) object with `value`/`previous`; this
 * takes a real `KpiTrend`-shaped value (label/value/trendPercent — see
 * src/features/dashboard/utils/calculateKpis.ts) plus the already-
 * formatted display string, so the same tile still works for currency,
 * percentages and day counts without this component ever computing a
 * financial figure itself.
 */
export function MetricCard({
  label,
  formattedValue,
  trendPercent,
  higherIsBetter = true,
  hint,
  className,
}: {
  label: string;
  formattedValue: string;
  /** Omit when there's no real comparative figure to show. */
  trendPercent?: number;
  higherIsBetter?: boolean;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-border bg-card p-5',
        className,
      )}
    >
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="figure text-2xl font-semibold tabular-nums">
        {formattedValue}
      </p>
      {trendPercent !== undefined ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Movement trendPercent={trendPercent} higherIsBetter={higherIsBetter} />
          <span className="text-xs text-muted-foreground">
            vs previous period
          </span>
        </div>
      ) : null}
      {hint ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
