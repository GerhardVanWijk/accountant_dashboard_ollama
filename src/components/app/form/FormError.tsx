import type { ReactNode } from 'react';
import { AlertTriangleIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Required-field marker for a `FieldLabel`. Visual `*` plus a screen-reader
 * word so the requirement is not colour-only.
 *
 *   <FieldLabel htmlFor="name">Customer name <RequiredMark /></FieldLabel>
 */
export function RequiredMark() {
  return (
    <>
      <span aria-hidden="true" className="text-destructive">
        *
      </span>
      <span className="sr-only">(required)</span>
    </>
  );
}

/**
 * A form-level error banner — for an error that is not tied to one field
 * (a failed save, a server rejection, a cross-field rule). Field-level
 * errors keep using the shadcn `FieldError` under the input. Readable in
 * dark mode (semantic `destructive` token, never a raw colour).
 */
export function FormError({ children, className }: { children: ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive',
        className,
      )}
    >
      <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
