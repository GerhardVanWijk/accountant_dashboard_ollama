import type { ReactNode } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/shadcn/alert-dialog';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button + destructive semantics — for delete / void / irreversible actions. */
  destructive?: boolean;
  /** Disable the confirm button (e.g. while the action runs). */
  pending?: boolean;
  /** Error from a failed attempt — shown as an alert above the buttons. */
  error?: ReactNode;
  onConfirm: () => void;
}

/**
 * One shared confirmation prompt for the whole app — the discard-unsaved-
 * changes prompt `FormShell` shows, and (from P3D) the ~7 hand-rolled
 * delete/void `AlertDialog`s. Keeps destructive actions on ONE semantic red
 * treatment and the button order consistent (Cancel left, action right).
 *
 * Built on `AlertDialogContent`, which is deliberately NOT brand-ringed —
 * a confirmation is not a form surface.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  pending = false,
  error,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? 'destructive' : 'default'}
            disabled={pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
