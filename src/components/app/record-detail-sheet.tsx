import type { ReactNode } from 'react';
import { AlertTriangleIcon, Loader2, SearchXIcon } from 'lucide-react';
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
  /** Only rendered when state === 'ready'. */
  children?: ReactNode;
  /** Rendered at the bottom, e.g. Edit / Record Payment actions — only shown when state === 'ready'. */
  actions?: ReactNode;
  className?: string;
}

export function RecordDetailSheet({
  open,
  onOpenChange,
  title,
  titleAdornment,
  description,
  state,
  errorMessage = 'Something went wrong loading this record.',
  notFoundMessage = 'This record could not be found.',
  children,
  actions,
  className,
}: RecordDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={cn('w-full gap-0 overflow-y-auto sm:max-w-lg', className)}>
        <SheetHeader className="border-b border-border">
          <div className="flex items-center gap-2 pr-8">
            <SheetTitle className="truncate">{title}</SheetTitle>
            {titleAdornment}
          </div>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-6 p-4">
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

        {state === 'ready' && actions ? (
          <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-border bg-popover p-4">{actions}</div>
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
    <div className={cn('flex flex-col gap-0.5', className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

export interface RelatedRecordItem {
  label: string;
  /** Rendered value — plain text, or a RecordLink if this relationship is genuinely clickable. */
  value: ReactNode;
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
      <dl className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 px-3 py-2">
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className="text-sm">{item.value}</dd>
          </div>
        ))}
      </dl>
    </RecordDetailSection>
  );
}
