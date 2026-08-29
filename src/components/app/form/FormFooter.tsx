import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { useFormShell } from './form-shell-context';

export interface FormFooterProps {
  /** Cancel + primary action buttons, in that DOM order. */
  children: ReactNode;
  /**
   * A destructive action (Delete / Void) — pinned to the LEFT, away from the
   * primary action, so it is never fat-fingered. Keep its semantic red
   * (`<Button variant="destructive">`).
   */
  destructiveAction?: ReactNode;
  /** Server / submit error — shown as an alert above the buttons. */
  error?: ReactNode;
  className?: string;
}

/**
 * The fixed footer of a `FormShell` (P3B.4).
 *
 * Sits outside the scroll region → the actions can never be pushed
 * off-screen by a long form. `flex-col-reverse` on mobile puts the primary
 * action on top and within thumb reach; from `sm` it is a right-aligned
 * row. The audit found 40 forms hand-rolling a `<div class="flex justify-end
 * … border-t pt-4">` *inside* the scroll area — this replaces all of them.
 */
export function FormFooter({ children, destructiveAction, error, className }: FormFooterProps) {
  const shell = useFormShell();

  return (
    <div
      data-slot="form-footer"
      className={cn(
        'flex shrink-0 flex-col gap-3 border-t border-border bg-muted/50 p-4 sm:px-6',
        className,
      )}
    >
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        {destructiveAction ? (
          <div className="sm:mr-auto" data-slot="form-footer-destructive" data-pending={shell?.pending || undefined}>
            {destructiveAction}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
