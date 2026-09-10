import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { ChevronRightIcon } from 'lucide-react';

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
 * A single metric tile: an icon chip, an uppercase label, a compact tabular
 * figure and one line of supporting text. `tone` drives the icon-chip
 * colour; `warning`/`negative` additionally give the tile a coloured
 * hairline + faint wash and colour the figure, so an "awaiting" or
 * "out of balance" count reads as needing attention at a glance.
 *
 * Density (global UX pass): tiles are information-dense, not dashboard
 * blocks — modest padding, a small icon chip, an `text-lg`/`text-base`
 * figure. `size="compact"` tightens it further for record-detail strips
 * that carry 4-8 metrics. The figure wraps inside its own tile
 * (`[overflow-wrap:anywhere]`, `min-w-0` everywhere) so a long currency
 * value like `R 1 574 853,75` never widens the grid, the page, or a
 * neighbouring tile — it takes a second line and the row stays aligned.
 *
 * Purely presentational — it formats nothing and computes nothing, the
 * caller passes an already-formatted `value` string. Pass `onActivate` to
 * turn the whole tile into a drill-down control (button semantics, focus
 * ring, hover affordance, trailing chevron).
 */
export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'default',
  size = 'default',
  onActivate,
  activateLabel,
  className,
}: {
  icon?: LucideIcon;
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: StatTone;
  /** `compact` — a lower, denser tile for record-detail summary strips where 4-8 metrics must not dominate the page. */
  size?: 'default' | 'compact';
  /** When set the whole tile is a button that drills into the evidence behind the figure. */
  onActivate?: () => void;
  /** Accessible name for the drill-down button (defaults to `View {label}`). */
  activateLabel?: string;
  className?: string;
}) {
  const compact = size === 'compact';
  const interactive = typeof onActivate === 'function';

  const body = (
    <>
      {Icon ? (
        <span
          className={cn(
            'grid shrink-0 place-items-center rounded-lg',
            compact ? 'size-7' : 'size-9',
            chipClass[tone],
          )}
        >
          <Icon className={compact ? 'size-3.5' : 'size-4'} aria-hidden="true" />
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1 text-[0.7rem] font-semibold tracking-wider text-muted-foreground uppercase">
          <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
          {interactive ? (
            <ChevronRightIcon
              className="size-3 shrink-0 opacity-0 transition-opacity group-hover/stat:opacity-100 group-focus-visible/stat:opacity-100"
              aria-hidden="true"
            />
          ) : null}
        </span>
        <span
          className={cn(
            'figure font-semibold tabular-nums tracking-tight [overflow-wrap:anywhere]',
            compact ? 'mt-0.5 text-base leading-tight' : 'mt-1 text-lg leading-tight',
            valueToneClass[tone],
          )}
        >
          {value}
        </span>
        {hint ? (
          <span className="mt-1 text-xs leading-snug text-muted-foreground [overflow-wrap:anywhere]">{hint}</span>
        ) : null}
      </div>
    </>
  );

  const base = cn(
    'flex min-w-0 items-start rounded-xl border bg-card text-left',
    compact ? 'gap-2.5 p-2.5 sm:p-3' : 'gap-3 p-3.5 sm:p-4',
    frameClass[tone],
    className,
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onActivate}
        aria-label={activateLabel ?? `View ${label}`}
        className={cn(
          base,
          'group/stat w-full cursor-pointer transition-colors hover:border-brand-outline hover:bg-accent/40',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        )}
      >
        {body}
      </button>
    );
  }

  return <div className={base}>{body}</div>;
}

/**
 * Responsive grid for a row of `StatTile`s. `columns` caps the widest
 * layout; tiles collapse through a sensible ladder (never fewer than two
 * up on a phone, four-up on a laptop) so an eight-metric strip is a single
 * dense row on a wide desktop and a tidy 2×4 grid on a laptop — never eight
 * crushed boxes, never a giant stack. Columns use `minmax(0,1fr)` (Tailwind
 * `grid-cols-*`) so one long figure can't force its column wider.
 */
const stripColumns: Record<2 | 3 | 4 | 5 | 6 | 7 | 8, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 xl:grid-cols-4',
  5: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6',
  7: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7',
  8: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8',
};

export function StatStrip({
  columns = 3,
  className,
  children,
}: {
  /** Cap on the widest layout — pass the actual number of tiles (2-8); don't pad. */
  columns?: 2 | 3 | 4 | 5 | 6 | 7 | 8;
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn('grid gap-3 sm:gap-3.5', stripColumns[columns], className)}>{children}</div>;
}
