import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type StatTone = 'default' | 'positive' | 'warning' | 'negative' | 'info' | 'brand';

const chipClass: Record<StatTone, string> = {
  default: 'bg-muted text-muted-foreground',
  positive: 'bg-status-positive-muted text-status-positive',
  warning: 'bg-status-warning-muted text-status-warning',
  negative: 'bg-status-negative-muted text-status-negative',
  info: 'bg-status-info-muted text-status-info',
  brand: 'bg-brand-muted text-brand',
};

/** Tiles get a coloured hairline + faint wash only for the states that need attention. */
const frameClass: Record<StatTone, string> = {
  default: 'border-border',
  positive: 'border-border',
  info: 'border-border',
  brand: 'border-border',
  warning: 'border-status-warning-outline bg-status-warning-surface/40',
  negative: 'border-status-negative-outline bg-status-negative-surface/40',
};

const valueToneClass: Record<StatTone, string> = {
  default: 'text-foreground',
  positive: 'text-foreground',
  info: 'text-foreground',
  brand: 'text-foreground',
  warning: 'text-status-warning',
  negative: 'text-status-negative',
};

/**
 * A single metric tile: an icon chip, an uppercase label, a large tabular
 * figure and one line of supporting text. `tone` drives the icon-chip
 * colour; `warning`/`negative` additionally give the tile a coloured
 * hairline + faint wash and colour the figure, so an "awaiting" or
 * "out of balance" count reads as needing attention at a glance.
 *
 * Purely presentational — it formats nothing and computes nothing, the
 * caller passes an already-formatted `value` string.
 */
export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'default',
  size = 'default',
  className,
}: {
  icon?: LucideIcon;
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: StatTone;
  /** `compact` — a lower, denser tile for record-detail summary strips where 4-5 metrics must not dominate the page. */
  size?: 'default' | 'compact';
  className?: string;
}) {
  const compact = size === 'compact';
  return (
    <div
      className={cn(
        'flex items-start rounded-xl border bg-card',
        compact ? 'gap-3 p-3 sm:p-3.5' : 'gap-3.5 p-4 sm:p-5',
        frameClass[tone],
        className,
      )}
    >
      {Icon ? (
        <span
          className={cn(
            'grid shrink-0 place-items-center rounded-lg',
            compact ? 'size-8' : 'size-10',
            chipClass[tone],
          )}
        >
          <Icon className={compact ? 'size-4' : 'size-5'} aria-hidden="true" />
        </span>
      ) : null}
      <div className="flex min-w-0 flex-col">
        <span className="text-[0.7rem] font-semibold tracking-wider text-muted-foreground uppercase">
          {label}
        </span>
        <span
          className={cn(
            'figure font-semibold tabular-nums tracking-tight',
            compact ? 'mt-0.5 text-lg' : 'mt-1 text-2xl',
            valueToneClass[tone],
          )}
        >
          {value}
        </span>
        {hint ? <span className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</span> : null}
      </div>
    </div>
  );
}

/**
 * Responsive grid for a row of `StatTile`s. `columns` caps the widest
 * layout; tiles collapse to two-up then one-up so a four-metric strip is
 * never crushed into four tiny boxes on a laptop.
 */
const stripColumns: Record<2 | 3 | 4 | 5, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 xl:grid-cols-4',
  5: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
};

export function StatStrip({
  columns = 3,
  className,
  children,
}: {
  /** Cap on the widest layout — pass the actual number of tiles (2-5); don't pad to four. */
  columns?: 2 | 3 | 4 | 5;
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn('grid gap-3 sm:gap-4', stripColumns[columns], className)}>{children}</div>;
}
