import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface RecordLinkProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  children: ReactNode;
  className?: string;
}

/**
 * The shared visual language for "this text opens a record" — a table
 * row's own identifier column (Invoice number, Customer name, Journal
 * entry number) and every related-record reference inside a detail view
 * (RecordDetailSheet's RelatedRecordsSection, "Customer: X", "Applied to
 * INV-1002", "Journal JE-2026-00421"). One component instead of copying
 * `text-brand hover:underline` at every call site — per the audit's rule
 * "do not copy-paste page-specific CSS when a token/component can solve it
 * globally."
 *
 * A real <button>, not an <a> — every current use opens an in-app detail
 * sheet/overlay rather than navigating to a URL (see RecordDetailSheet).
 * Callers that DO want real navigation should still use this for the
 * visual treatment and handle navigation in onClick.
 */
export function RecordLink({ children, className, ...props }: RecordLinkProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline text-left font-medium text-brand underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:rounded-sm',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
