import { useEffect } from 'react';

/**
 * Warns the user before the browser tab is closed / reloaded / navigated
 * away from the app entirely while a form has unsaved edits.
 *
 * This is the OUT-OF-APP half of the unsaved-changes story. The in-app half
 * (closing the dialog/sheet, pressing Escape, clicking the overlay) is owned
 * by `FormShell` itself, which shows the `ConfirmDialog` discard prompt.
 * Blocking an in-app *route* change (`<Link>` / `navigate()`) is a page-level
 * concern — a page adopts `useUnsavedChangesBlocker` (P3D) for that; it is
 * kept separate because `useBlocker` requires a data-router context that an
 * isolated form/modal render does not have.
 *
 * Apply on CREATE and EDIT forms only. A read-only DETAIL view is never
 * "dirty" and must not trigger this.
 */
export function useUnsavedChangesPrompt(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Legacy browsers need returnValue set to trigger the native prompt.
      event.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
}
