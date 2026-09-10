import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { ChevronRightIcon } from 'lucide-react';

import { Movement } from '@/components/app/figure';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/shadcn/tooltip';
import { cn } from '@/lib/utils';

export type StatTone = 'default' | 'positive' | 'warning' | 'negative' | 'info' | 'brand';

/** `micro` — icon + figure only, wording carried by the tooltip. `compact` — dense tile that still shows its label. `default` — the full stacked tile. */
export type StatVariant = 'default' | 'compact' | 'micro';

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
 * A single metric tile: an icon chip, a label, a compact tabular figure and
 * one line of supporting text. `tone` drives the icon-chip colour;
 * `warning`/`negative` additionally give the tile a coloured hairline + faint
 * wash and colour the figure, so an "awaiting" or "out of balance" count
 * reads as needing attention at a glance.
 *
 * Density (global UX pass) — three variants for one visual language:
 *  - `default` — the full stacked tile (dashboards, standalone KPIs);
 *  - `compact` — a lower, denser tile for record-detail strips that carry
 *    4-8 metrics, label still visible;
 *  - `micro` — icon + figure only, centred; the label and hint are hidden
 *    from the tile (kept in the accessibility tree) and revealed in a deep
 *    branded tooltip on hover/focus. This is what keeps an eight-metric strip
 *    readable at 1366px, where a visible label like "Available" would
 *    otherwise wrap to "AVAIL / ABLE".
 *
 * Short UI labels wrap on whole words only (never letter-by-letter); the
 * figure keeps `[overflow-wrap:anywhere]` + `min-w-0` so a long currency
 * value like `R 1 574 853,75` takes a second line rather than widening the
 * grid, the page or a neighbour.
 *
 * Purely presentational — it formats nothing and computes nothing, the caller
 * passes an already-formatted `value` string. Pass `onActivate` to turn the
 * whole tile into a drill-down control (button semantics, focus ring, hover
 * affordance, trailing chevron on `default`/`compact`).
 */
export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'default',
  variant,
  size,
  tooltip,
  trendPercent,
  higherIsBetter = true,
  onActivate,
  activateLabel,
  className,
}: {
  icon?: LucideIcon;
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: StatTone;
  variant?: StatVariant;
  /** @deprecated use `variant`. `size="compact"` maps to `variant="compact"`. */
  size?: 'default' | 'compact';
  /** Force the branded label/figure/hint tooltip on or off. Defaults on for `micro`. */
  tooltip?: boolean;
  /** Period-on-period movement, already computed by the caller. Renders a `Movement` row under the figure (`default`/`compact` only). */
  trendPercent?: number;
  /** Whether an increase in this metric reads as good news (expenses rising does not). */
  higherIsBetter?: boolean;
  /** When set the whole tile is a button that drills into the evidence behind the figure. */
  onActivate?: () => void;
  /** Accessible name for the drill-down button (defaults to `View {label}`). */
  activateLabel?: string;
  className?: string;
}) {
  const v: StatVariant = variant ?? (size === 'compact' ? 'compact' : 'default');
  const compact = v === 'compact';
  const micro = v === 'micro';
  const interactive = typeof onActivate === 'function';
  const showTooltip = tooltip ?? micro;

  const iconChip = Icon ? (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-lg',
        v === 'default' ? 'size-9' : 'size-7',
        chipClass[tone],
      )}
    >
      <Icon className={v === 'default' ? 'size-4' : 'size-3.5'} aria-hidden="true" />
    </span>
  ) : null;

  const figure = (
    <span
      className={cn(
        'figure font-semibold tabular-nums tracking-tight [overflow-wrap:anywhere]',
        micro
          ? 'text-sm leading-tight sm:text-[0.9375rem]'
          : compact
            ? 'mt-0.5 text-base leading-tight'
            : 'mt-1 text-lg leading-tight',
        valueToneClass[tone],
      )}
    >
      {value}
    </span>
  );

  const base = cn(
    'flex min-w-0 rounded-xl border bg-card text-left',
    micro ? 'flex-col items-center gap-1.5 p-2.5 text-center' : 'items-start',
    compact ? 'gap-2.5 p-2.5 sm:p-3' : !micro ? 'gap-3 p-3.5 sm:p-4' : '',
    frameClass[tone],
    className,
  );

  const body = micro ? (
    <>
      {iconChip}
      {/* label + hint stay in the a11y tree (screen readers, find-in-page) but
          off the tile — the tooltip carries them for sighted/keyboard users. */}
      <span className="sr-only">{label}</span>
      {hint ? <span className="sr-only">{hint}</span> : null}
      {figure}
    </>
  ) : (
    <>
      {iconChip}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1 text-[0.7rem] font-semibold tracking-wider text-muted-foreground uppercase">
          <span className="min-w-0 break-words">{label}</span>
          {interactive ? (
            <ChevronRightIcon
              className="size-3 shrink-0 opacity-0 transition-opacity group-hover/stat:opacity-100 group-focus-visible/stat:opacity-100"
              aria-hidden="true"
            />
          ) : null}
        </span>
        {figure}
        {trendPercent !== undefined ? (
          <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <Movement trendPercent={trendPercent} higherIsBetter={higherIsBetter} />
            <span className="text-[0.7rem] text-muted-foreground">vs previous period</span>
          </span>
        ) : null}
        {hint ? (
          <span className="mt-1 text-xs leading-snug text-muted-foreground break-words">{hint}</span>
        ) : null}
      </div>
    </>
  );

  let tile: ReactNode;
  if (interactive) {
    tile = (
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
  } else if (micro) {
    // Non-interactive micro tiles are still focusable so the tooltip is
    // reachable by keyboard.
    tile = (
      <div className={cn(base, 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50')} tabIndex={0}>
        {body}
      </div>
    );
  } else {
    tile = <div className={base}>{body}</div>;
  }

  if (!showTooltip) return <>{tile}</>;

  return (
    <Tooltip>
      <TooltipTrigger render={tile} />
      <TooltipContent variant="brand" side="top" className="flex flex-col gap-0.5">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums">{value}</span>
        {hint ? <span className="opacity-90">{hint}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Responsive grid for a row of `StatTile`s. `columns` caps the widest layout;
 * tiles collapse through a sensible ladder (never fewer than two up on a
 * phone, four-up on a laptop) so an eight-metric strip is a single dense row
 * on a wide desktop and a tidy grid on a laptop — never eight crushed boxes,
 * never a giant stack. Columns use `minmax(0,1fr)` (Tailwind `grid-cols-*`)
 * so one long figure can't force its column wider.
 */
const stripColumns: Record<2 | 3 | 4 | 5 | 6 | 7 | 8, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 xl:grid-cols-4',
  5: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6',
  7: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7',
  // 1366px sits in `xl` (>=1280) but not `2xl` (>=1536): keep eight metrics at
  // four-up there so a labelled tile never has to wrap, and only fan out to a
  // single dense row on a genuinely wide screen.
  8: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-8',
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

/** One metric for the data-driven `StatTileGrid` (report / dashboard summary strips). */
export interface StatMetric {
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: StatTone;
  icon?: LucideIcon;
  trendPercent?: number;
  higherIsBetter?: boolean;
  onActivate?: () => void;
  activateLabel?: string;
}

/**
 * Data-driven `StatStrip` — pass an array of metrics instead of composing
 * `<StatTile>` children by hand. The shared shape for report and dashboard
 * summary rows; `columns` defaults to the metric count (capped 2-8).
 */
export function StatTileGrid({
  metrics,
  columns,
  variant = 'compact',
  className,
}: {
  metrics: StatMetric[];
  columns?: 2 | 3 | 4 | 5 | 6 | 7 | 8;
  variant?: StatVariant;
  className?: string;
}) {
  const cols = (columns ?? Math.min(8, Math.max(2, metrics.length))) as 2 | 3 | 4 | 5 | 6 | 7 | 8;
  return (
    <StatStrip columns={cols} className={className}>
      {metrics.map((m) => (
        <StatTile key={m.label} variant={variant} {...m} />
      ))}
    </StatStrip>
  );
}
