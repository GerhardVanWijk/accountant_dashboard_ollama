import type { ReactNode } from 'react';
import { AlertTriangleIcon, ChevronRightIcon, Loader2, SearchXIcon } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/shadcn/sheet';
import { cn } from '@/lib/utils';

/**
 * Shared record-detail architecture (audit rule "avoid implementing 20
 * unrelated modal systems... but domain-specific content must remain
 * domain-specific"). This component owns the outer surface, the
 * loading/error/not-found states, and the header — every domain module
 * (Invoices, Journals, Customers, ...) supplies its own body content as
 * children, never forced into one generic field schema.
 *
 * Deliberately a Sheet (side panel), not a route navigation or a full
 * Dialog — per the audit's "clicking a record should not destroy the
 * user's context" requirement: the underlying list stays mounted and in
 * place behind the sheet, with its filters/search/sort/scroll untouched;
 * closing the sheet returns exactly there.
 */
export interface RecordDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** e.g. a status badge, rendered next to the title. */
  titleAdornment?: ReactNode;
  description?: ReactNode;
  state: 'loading' | 'error' | 'not-found' | 'ready';
  errorMessage?: string;
  notFoundMessage?: string;
  /**
   * Panel width. `default` is the compact record-detail panel (a single
   * record's metadata + related records + audit history). `wide` is for the
   * sheets that host a whole rich `*DetailPage` (Customer, Supplier) — that
   * content needs room to breathe. Both collapse to full-width on mobile.
   */
  width?: 'default' | 'wide';
  /** Only rendered when state === 'ready'. */
  children?: ReactNode;
  /** Rendered at the bottom, e.g. Edit / Record Payment actions — only shown when state === 'ready'. */
  actions?: ReactNode;
  className?: string;
}

/**
 * Responsive width, expressed with the `data-[side=right]:` variant so it
 * actually overrides the shared `SheetContent`'s baked-in
 * `data-[side=right]:w-3/4` / `data-[side=right]:sm:max-w-sm` (a plain
 * `sm:max-w-*` className loses the specificity race against it — the bug
 * that pinned every record-detail panel, wide ones included, to 384px).
 */
const widthClass: Record<NonNullable<RecordDetailSheetProps['width']>, string> = {
  default:
    'data-[side=right]:w-full data-[side=right]:sm:max-w-[26rem] data-[side=right]:xl:max-w-[30rem]',
  wide: 'data-[side=right]:w-full data-[side=right]:sm:max-w-2xl data-[side=right]:lg:max-w-3xl',
};

export function RecordDetailSheet({
  open,
  onOpenChange,
  title,
  titleAdornment,
  description,
  state,
  errorMessage = 'Something went wrong loading this record.',
  notFoundMessage = 'This record could not be found.',
  width = 'default',
  children,
  actions,
  className,
}: RecordDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Non-scrolling outer surface: pinned header, one scrolling body, pinned
          footer (the FormShell architecture). Keeps the × close button — which
          `SheetContent` positions `absolute` against this surface — reachable
          no matter how far the body has scrolled. */}
      <SheetContent className={cn('gap-0 overflow-hidden', widthClass[width], className)}>
        <SheetHeader className="shrink-0 border-b border-border">
          <div className="flex items-start gap-2 pr-8">
            <SheetTitle className="min-w-0 [overflow-wrap:anywhere] line-clamp-2">{title}</SheetTitle>
            {titleAdornment ? <span className="mt-0.5 shrink-0">{titleAdornment}</span> : null}
          </div>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>

        <div className="app-scroll min-h-0 flex-1 overflow-y-auto">
          <div className={cn('flex min-w-0 flex-col gap-6 p-4 sm:p-6', state !== 'ready' && 'min-h-full')}>
            {state === 'loading' && (
              <div role="status" className="flex flex-1 items-center justify-center gap-3 py-12 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                <p className="text-sm">Loading…</p>
              </div>
            )}
            {state === 'error' && (
              <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
                <AlertTriangleIcon className="size-6 text-status-negative" aria-hidden="true" />
                <p className="text-sm">{errorMessage}</p>
              </div>
            )}
            {state === 'not-found' && (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
                <SearchXIcon className="size-6" aria-hidden="true" />
                <p className="text-sm">{notFoundMessage}</p>
              </div>
            )}
            {state === 'ready' && children}
          </div>
        </div>

        {state === 'ready' && actions ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-muted/50 p-4 sm:px-6">
            {actions}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/** A titled block of fields within a record detail body — the sheet-scale equivalent of SectionCard. */
export function RecordDetailSection({ title, actions, children, className }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {title || actions ? (
        <div className="flex items-center justify-between">
          {title ? <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** A label/value pair — the most common row shape inside a detail section. */
export function RecordDetailField({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground [overflow-wrap:anywhere]">{value}</span>
    </div>
  );
}

/**
 * The single most important figure on a record, shown full-width above the
 * metadata grid — a current balance, an outstanding total, a carrying value.
 * Large and readable at every magnitude ("R 0,00" through
 * "R 1 250 000 000,00"): it wraps rather than colliding with a neighbour
 * because nothing sits beside it.
 */
export function RecordDetailHero({
  label,
  value,
  hint,
  tone = 'default',
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'positive' | 'negative' | 'warning';
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      <span
        className={cn(
          'figure text-2xl font-semibold tabular-nums [overflow-wrap:anywhere]',
          tone === 'positive' && 'text-status-positive',
          tone === 'negative' && 'text-status-negative',
          tone === 'warning' && 'text-status-warning',
        )}
      >
        {value}
      </span>
      {hint ? <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{hint}</span> : null}
    </div>
  );
}

/**
 * Two-column metadata grid for a record-detail body — never three, which is
 * what crushed financial values into each other in the old side panel. The
 * fields it holds are short (a masked account number, a currency code, a
 * ledger code, a date, a status badge); the headline figure goes in a
 * full-width `RecordDetailHero` above it, not in here.
 */
export function RecordDetailGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 gap-x-4 gap-y-4', className)}>{children}</div>;
}

export interface RelatedRecordItem {
  label: string;
  /** Rendered value — plain text, or a RecordLink if this relationship is genuinely clickable. */
  value: ReactNode;
  /**
   * When set, the WHOLE row becomes the click target (larger hit area than a
   * link buried in the value) and a chevron is shown. Use instead of wrapping
   * `value` in a `RecordLink` for navigational shortcuts.
   */
  onActivate?: () => void;
}

/**
 * "Related records" list — only ever shown for relationships that genuinely
 * exist for this specific record (audit rule: "Not every record will have
 * every relationship... Only show relationships that genuinely exist").
 * Callers filter their own item list before passing it in; this component
 * never invents a placeholder row for a relationship that isn't there.
 */
export function RelatedRecordsSection({ items, title = 'Related records' }: { items: RelatedRecordItem[]; title?: string }) {
  if (items.length === 0) return null;
  return (
    <RecordDetailSection title={title}>
      <dl className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
        {items.map((item) =>
          item.onActivate ? (
            <button
              key={item.label}
              type="button"
              onClick={item.onActivate}
              className="flex items-start justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              <dt className="min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">{item.label}</dt>
              <dd className="flex min-w-0 items-center gap-1 text-sm">
                <span className="min-w-0 [overflow-wrap:anywhere]">{item.value}</span>
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </dd>
            </button>
          ) : (
            <div key={item.label} className="flex items-start justify-between gap-3 px-3 py-2.5">
              <dt className="min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">{item.label}</dt>
              <dd className="min-w-0 text-sm [overflow-wrap:anywhere]">{item.value}</dd>
            </div>
          ),
        )}
      </dl>
    </RecordDetailSection>
  );
}
