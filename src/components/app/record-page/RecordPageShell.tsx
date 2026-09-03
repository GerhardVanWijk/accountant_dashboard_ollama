import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangleIcon, ArrowLeftIcon, ChevronRightIcon, Loader2, SearchXIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RecordCrumb {
  label: string;
  /** Omitted on the final (current record) crumb. */
  to?: string;
}

export interface RecordPageShellProps {
  /** Module → list → record. The last crumb is the current record and needs no `to`. */
  breadcrumbs: RecordCrumb[];
  /** Route the "← <backLabel>" link returns to (usually the list). */
  backTo: string;
  backLabel: string;
  state: 'loading' | 'error' | 'not-found' | 'ready';
  errorMessage?: string;
  notFoundMessage?: string;
  children?: ReactNode;
  className?: string;
  /**
   * `true` when the page is rendered inside <RelatedRecordPreview> (an
   * over-the-page overlay) rather than at its own route — hides the
   * breadcrumb + "← back" link (the dialog has its own close affordance
   * and the crumb targets would navigate the page behind the overlay).
   */
  embedded?: boolean;
}

/**
 * Full-page record-detail shell — the deliberate replacement for squeezing
 * a business document (line items, an action bar, related records, an
 * accounting trace, an audit trail) into the ~450px right-hand
 * RecordDetailSheet. Uses the full application content width (AppLayout's
 * `<main>` has no max-width), a real breadcrumb, and a real back link, so
 * the record has a proper URL (`/sales/orders/<id>`) rather than
 * `?record=<id>` modal state.
 *
 * Simple record previews (a bank account, a GL account, a contact) still
 * use RecordDetailSheet — this is only for records the sheet was cramping.
 */
export function RecordPageShell({
  breadcrumbs,
  backTo,
  backLabel,
  state,
  errorMessage = 'Something went wrong loading this record.',
  notFoundMessage = 'This record could not be found — it may have been deleted.',
  children,
  className,
  embedded = false,
}: RecordPageShellProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-6', className)}>
      {!embedded && (
      <div className="flex flex-col gap-3">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            {breadcrumbs.map((crumb, i) => {
              const isLast = i === breadcrumbs.length - 1;
              return (
                <li key={`${crumb.label}-${i}`} className="flex items-center gap-1.5">
                  {crumb.to && !isLast ? (
                    <Link to={crumb.to} className="hover:text-foreground hover:underline">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className={cn(isLast && 'text-foreground')} aria-current={isLast ? 'page' : undefined}>
                      {crumb.label}
                    </span>
                  )}
                  {!isLast && <ChevronRightIcon className="size-3.5 shrink-0" aria-hidden="true" />}
                </li>
              );
            })}
          </ol>
        </nav>

        <Link
          to={backTo}
          aria-label={`Back to ${backLabel}`}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          {backLabel}
        </Link>
      </div>
      )}

      {state === 'loading' && (
        <div role="status" className="flex flex-1 items-center justify-center gap-3 py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading…</p>
        </div>
      )}
      {state === 'error' && (
        <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
          <AlertTriangleIcon className="size-6 text-status-negative" aria-hidden="true" />
          <p className="text-sm">{errorMessage}</p>
        </div>
      )}
      {state === 'not-found' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
          <SearchXIcon className="size-6" aria-hidden="true" />
          <p className="text-sm">{notFoundMessage}</p>
        </div>
      )}
      {state === 'ready' && children}
    </div>
  );
}
