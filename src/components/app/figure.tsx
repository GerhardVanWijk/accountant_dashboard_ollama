/**
 * Monetary and movement display primitives.
 *
 * Ported from accounting-v0-frontend/components/app/figure.tsx. `Movement`
 * is adapted from v0's original: v0 computed a percentage from
 * `current`/`previous`; this app's real DashboardKpis
 * (src/features/dashboard/utils/calculateKpis.ts) already computes
 * `trendPercent` itself (the actual accounting-aware trend, not a naive
 * percentage — see that file for why), so re-deriving it here from raw
 * current/previous would risk disagreeing with the real figure. Movement
 * now takes `trendPercent` directly; nothing here still derives a
 * financial figure itself.
 */

import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';

import {
  formatAmount,
  formatCurrency,
  formatSignedPercent,
  formatStatementAmount,
} from '@/lib/app/format';
import { cn } from '@/lib/utils';

/** Right-aligned currency for table cells, with tabular figures. */
export function Amount({
  value,
  className,
  plain,
  statement,
}: {
  value: number;
  className?: string;
  /** Omits the currency symbol — for columns that carry it in the header. */
  plain?: boolean;
  /** Wraps negatives in brackets, the accounting convention. */
  statement?: boolean;
}) {
  const text = statement
    ? formatStatementAmount(value)
    : plain
      ? formatAmount(value)
      : formatCurrency(value);

  return (
    <span
      className={cn(
        'figure tabular-nums',
        value < 0 && 'text-negative',
        className,
      )}
    >
      {text}
    </span>
  );
}

/**
 * Period-on-period movement. `trendPercent` comes pre-computed from a real
 * accounting source (see file doc comment). `higherIsBetter` decides
 * whether an increase reads as positive or negative — expenses rising is
 * not good news.
 */
export function Movement({
  trendPercent,
  higherIsBetter = true,
  className,
}: {
  trendPercent: number;
  higherIsBetter?: boolean;
  className?: string;
}) {
  const rising = trendPercent > 0;
  const flat = Math.abs(trendPercent) < 0.05;
  const good = flat ? null : rising === higherIsBetter;

  const Icon = flat ? ArrowRight : rising ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium',
        good === null && 'text-muted-foreground',
        good === true && 'text-positive',
        good === false && 'text-negative',
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span className="figure tabular-nums">
        {formatSignedPercent(trendPercent)}
      </span>
    </span>
  );
}

/** Label above a figure — used in summary strips and detail panels. */
export function FigureBlock({
  label,
  value,
  hint,
  tone = 'default',
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'positive' | 'negative' | 'warning';
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span
        className={cn(
          'figure text-xl font-semibold tabular-nums',
          tone === 'positive' && 'text-positive',
          tone === 'negative' && 'text-negative',
          tone === 'warning' && 'text-warning',
        )}
      >
        {value}
      </span>
      {hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  );
}
