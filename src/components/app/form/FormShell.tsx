import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';

import { cn } from '@/lib/utils';
import {
  formDialogPopupBaseClass,
  formNaturalHeightClass,
  formOverlayClass,
  formSheetPopupBaseClass,
  formSheetWidthClass,
  formSizeHeightClass,
  formSizeWidthClass,
  type FormSize,
} from '@/components/app/form-surface';
import { ConfirmDialog } from './ConfirmDialog';
import { useUnsavedChangesPrompt } from './useUnsavedChangesPrompt';
import { FormShellContext, type FormMode, type FormShellContextValue } from './form-shell-context';

export interface FormShellProps {
  open: boolean;
  /**
   * Called ONLY when it is safe to close — either the form is not dirty, or
   * the user confirmed the discard prompt. The parent unmounts / flips its
   * own `open` state here.
   */
  onClose: () => void;
  /** Record shape → surface size. See `FormSize`. Default `md`. */
  size?: FormSize;
  /** `dialog` (centred modal) or `sheet` (right-side panel). Default `dialog`. */
  surface?: 'dialog' | 'sheet';
  /**
   * `stable` (default for a dialog) pins a fixed desktop height so switching
   * tabs / toggling sections never resizes the frame. `natural` lets the
   * surface size to its content up to the viewport cap — for short, simple
   * forms. Sheets are always full-height.
   */
  height?: 'stable' | 'natural';
  /**
   * `create` / `edit` get the unsaved-changes guard. `detail` is a read-only
   * inspection surface — it never wraps a `<form>`, never wires `onSubmit`,
   * and never prompts on close (a posted, immutable record must not open in
   * an editable form). Default `edit`.
   */
  mode?: FormMode;
  /** `true` while the form has unsaved edits. Ignored when `mode === 'detail'`. */
  isDirty?: boolean;
  /** `true` while a submit is in flight — the footer disables its actions. */
  pending?: boolean;
  /**
   * Wraps header/body/footer in a `<form>` and calls this on submit
   * (default prevented). Ignored when `mode === 'detail'`.
   */
  onSubmit?: () => void;
  /** Discard-prompt copy overrides. */
  discardTitle?: string;
  discardMessage?: string;
  className?: string;
  children: ReactNode;
}

const DISCARD_TITLE = 'Discard unsaved changes?';
const DISCARD_MESSAGE =
  'This form has changes that have not been saved. Closing it now will lose them.';

/**
 * The outer surface every Vertex form opens into (P3B.1).
 *
 * It owns exactly one thing: **sizing**. Width and height come from the
 * `size` token; individual forms and their tabs never redefine the outer
 * dimensions. On top of that it provides the brand-green ring, the
 * viewport-safe constraints, the flex-column skeleton (stable header →
 * scrolling body → stable footer), and the unsaved-changes close guard.
 *
 * It composes the base-ui dialog primitive directly rather than going
 * through `DialogContent` — `DialogContent` wraps its children in a generic
 * single scroll area with its own padding and close button, which fights a
 * form that wants its header and footer pinned outside the scroll region.
 * The popup styling is shared via `form-surface.ts` so it stays identical
 * to every other dialog.
 *
 *   <FormShell open={open} onClose={close} size="md" mode="edit"
 *              isDirty={form.formState.isDirty} pending={saving}
 *              onSubmit={form.handleSubmit(save)}>
 *     <FormHeader title="Edit customer" recordRef="CUS-0142" />
 *     <FormTabs tabs={[...]}> ... </FormTabs>       // or <FormBody>...</FormBody>
 *     <FormFooter><Button variant="outline" ...>Cancel</Button><Button type="submit">Save</Button></FormFooter>
 *   </FormShell>
 */
export function FormShell({
  open,
  onClose,
  size = 'md',
  surface = 'dialog',
  height = 'stable',
  mode = 'edit',
  isDirty = false,
  pending = false,
  onSubmit,
  discardTitle = DISCARD_TITLE,
  discardMessage = DISCARD_MESSAGE,
  className,
  children,
}: FormShellProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const guarded = mode !== 'detail';
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = guarded && isDirty;

  useUnsavedChangesPrompt(isDirtyRef.current);

  const requestClose = useCallback(() => {
    if (isDirtyRef.current) {
      setConfirmOpen(true);
      return;
    }
    onClose();
  }, [onClose]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) return;
      requestClose();
    },
    [requestClose],
  );

  const ctx = useMemo<FormShellContextValue>(
    () => ({
      surface,
      size,
      mode,
      pending,
      Title: DialogPrimitive.Title,
      Description: DialogPrimitive.Description,
      requestClose,
    }),
    [surface, size, mode, pending, requestClose],
  );

  const popupClass =
    surface === 'sheet'
      ? cn(formSheetPopupBaseClass, formSheetWidthClass[size], className)
      : cn(
          formDialogPopupBaseClass,
          formSizeWidthClass[size],
          height === 'natural' ? formNaturalHeightClass : formSizeHeightClass[size],
          className,
        );

  const useForm = guarded && typeof onSubmit === 'function';
  const innerClass = 'flex min-h-0 flex-1 flex-col';
  const inner = useForm ? (
    <form
      className={innerClass}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit!();
      }}
    >
      {children}
    </form>
  ) : (
    <div className={innerClass}>{children}</div>
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className={formOverlayClass} />
        <DialogPrimitive.Popup data-slot="form-shell" data-surface={surface} data-size={size} className={popupClass}>
          <FormShellContext.Provider value={ctx}>{inner}</FormShellContext.Provider>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={discardTitle}
        description={discardMessage}
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setConfirmOpen(false);
          onClose();
        }}
      />
    </DialogPrimitive.Root>
  );
}
