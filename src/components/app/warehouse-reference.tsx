import type { ReactNode } from 'react';
import { ArrowRightIcon } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/shadcn/tooltip';
import { cn } from '@/lib/utils';

/** The minimum a warehouse needs to be displayed — accepts a full `Warehouse` or a `{ code, name }` row projection. */
export interface WarehouseLike {
  id?: string | null;
  code?: string | null;
  name?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Canonical fallback order for a warehouse's short display reference:
 *   1. `warehouse.code`  (the authoritative human identifier — src/types/warehouse.ts)
 *   2. `warehouse.name`  (legacy / mid-migration rows with no code yet)
 *   3. the caller's `fallback`
 * Never a raw UUID — an id that looks like one is treated as "no code".
 */
// eslint-disable-next-line react-refresh/only-export-components -- co-located with the components that share its fallback logic (sort keys / search strings / detail headings)
export function warehouseRefText(warehouse: WarehouseLike | undefined | null, fallback = '—'): string {
  const code = warehouse?.code?.trim();
  if (code && !UUID_RE.test(code)) return code;
  const name = warehouse?.name?.trim();
  if (name && !UUID_RE.test(name)) return name;
  return fallback;
}

/** The full descriptive name, for the tooltip / accessible label. */
function warehouseFullText(warehouse: WarehouseLike | undefined | null): string | undefined {
  const name = warehouse?.name?.trim();
  return name && !UUID_RE.test(name) ? name : undefined;
}

function resolve(
  warehouse: WarehouseLike | undefined,
  id: string | undefined,
  warehouses: readonly WarehouseLike[] | undefined,
): WarehouseLike | undefined {
  if (warehouse) return warehouse;
  if (id && warehouses) return warehouses.find((w) => w.id === id);
  return undefined;
}

interface WarehouseReferenceProps {
  /** Pass a resolved warehouse, OR `id` + `warehouses` to look one up, OR raw `code`/`name`. */
  warehouse?: WarehouseLike;
  id?: string;
  warehouses?: readonly WarehouseLike[];
  code?: string | null;
  name?: string | null;
  /**
   * `compact` (default) — the short code, with the full name on a branded
   * hover/focus tooltip. `name` — the full descriptive name, no tooltip
   * (detail sections, headings, printed docs).
   */
  variant?: 'compact' | 'name';
  /** Shown when nothing resolves. Defaults to an em dash — never a UUID. */
  fallback?: string;
  className?: string;
}

/**
 * The one way a warehouse is named on screen. In dense operational and
 * accounting tables it shows the warehouse **code** (`WH-001`) so long
 * location names ("Main Distribution Centre - Montague Gardens") stop
 * crushing the Source-document / Party / Value columns; the full name stays
 * one hover or keyboard-focus away in the deep-green Vertex tooltip, and in
 * the accessible name. Internally the app keeps using the warehouse id /
 * foreign key — this is display only.
 */
export function WarehouseReference({
  warehouse,
  id,
  warehouses,
  code,
  name,
  variant = 'compact',
  fallback = '—',
  className,
}: WarehouseReferenceProps) {
  const resolved: WarehouseLike | undefined =
    resolve(warehouse, id, warehouses) ?? (code != null || name != null ? { code, name } : undefined);

  const short = warehouseRefText(resolved, fallback);
  const full = warehouseFullText(resolved);

  if (variant === 'name') {
    return <span className={className}>{full ?? short}</span>;
  }

  // Nothing extra to reveal — the code is already the whole story.
  if (!full || full === short) {
    return (
      <span className={cn('tabular-nums', className)}>{short}</span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            aria-label={`${short} — ${full}`}
            className={cn(
              'cursor-help tabular-nums underline decoration-dotted decoration-muted-foreground/40 underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              className,
            )}
          >
            {short}
          </span>
        }
      />
      <TooltipContent variant="brand" side="top" className="flex flex-col gap-0.5">
        <span className="font-semibold tabular-nums">{short}</span>
        <span className="opacity-90">{full}</span>
      </TooltipContent>
    </Tooltip>
  );
}

interface WarehouseRouteProps {
  from?: WarehouseLike;
  to?: WarehouseLike;
  fromId?: string;
  toId?: string;
  warehouses?: readonly WarehouseLike[];
  /** `WH-001 → WH-002` becomes a two-line `WH-001` / `→ WH-002` stack below this width. */
  stackBelow?: 'sm' | 'md' | 'lg' | 'never';
  className?: string;
}

/**
 * A stock-transfer route — `WH-001 → WH-002` — replacing the two-long-line
 * "Main Distribution Centre - Montague Gardens → Johannesburg Satellite
 * Branch - Midrand" that used to dominate a movement/transfer row. One
 * branded tooltip and one accessible label carry both full names.
 */
export function WarehouseRoute({
  from,
  to,
  fromId,
  toId,
  warehouses,
  stackBelow = 'never',
  className,
}: WarehouseRouteProps) {
  const fromW = resolve(from, fromId, warehouses);
  const toW = resolve(to, toId, warehouses);

  const fromShort = warehouseRefText(fromW);
  const toShort = warehouseRefText(toW);
  const fromFull = warehouseFullText(fromW);
  const toFull = warehouseFullText(toW);

  const stackClass =
    stackBelow === 'never'
      ? 'flex-row items-center'
      : stackBelow === 'sm'
        ? 'flex-col items-start sm:flex-row sm:items-center'
        : stackBelow === 'md'
          ? 'flex-col items-start md:flex-row md:items-center'
          : 'flex-col items-start lg:flex-row lg:items-center';

  const label = `From ${fromShort}${fromFull ? ` ${fromFull}` : ''} to ${toShort}${toFull ? ` ${toFull}` : ''}`;

  const body: ReactNode = (
    <span className={cn('inline-flex min-w-0 gap-1', stackClass, className)}>
      <span className="tabular-nums whitespace-nowrap">{fromShort}</span>
      <ArrowRightIcon className="size-3.5 shrink-0 self-center text-muted-foreground" aria-hidden="true" />
      <span className="tabular-nums whitespace-nowrap">{toShort}</span>
    </span>
  );

  if (!fromFull && !toFull) {
    return <span aria-label={label}>{body}</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span tabIndex={0} aria-label={label} className="cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            {body}
          </span>
        }
      />
      <TooltipContent variant="brand" side="top" className="flex flex-col gap-1">
        <span className="flex flex-col gap-0.5">
          <span className="text-[0.65rem] font-semibold tracking-wide uppercase opacity-75">From</span>
          <span className="font-semibold tabular-nums">{fromShort}</span>
          {fromFull ? <span className="opacity-90">{fromFull}</span> : null}
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="text-[0.65rem] font-semibold tracking-wide uppercase opacity-75">To</span>
          <span className="font-semibold tabular-nums">{toShort}</span>
          {toFull ? <span className="opacity-90">{toFull}</span> : null}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
