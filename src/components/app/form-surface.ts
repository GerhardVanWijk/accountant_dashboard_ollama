/**
 * Shared sizing standard for form & record-detail surfaces
 * (docs/CURRENT_TASKS.md #3, #4, #23).
 *
 * The problem this solves: `DialogContent` sizes to its content, so a
 * multi-tab form (Customer, Supplier, Company, Asset, ...) visibly
 * grows/shrinks the dialog every time you switch tabs — one tab has six
 * fields, another has none. Giving form dialogs a STABLE desktop height
 * (with the body scrolling internally) makes tab switches inert.
 *
 * Usage:
 *   <DialogContent className={formDialogClass}>       // standard form
 *   <DialogContent className={wideFormDialogClass}>   // line-items / wide grids
 *   <DialogContent className={compactDialogClass}>    // short single-purpose form
 *
 * DialogContent already provides: viewport cap (max-h-[calc(100%-2rem)]),
 * the brand-green ring, an internally-scrolling body wrapper
 * (`dialog-scroll-area`), and a sticky footer. These classes only pin the
 * width and the desktop height on top of that.
 *
 * `dvh` keeps it correct on mobile browser chrome; the `md:` prefix means
 * phones keep the natural content height (already viewport-capped) and only
 * desktop/laptop gets the fixed frame.
 */

/**
 * FIXED desktop height — use for forms whose body must stay a constant size:
 * multi-tab forms (so switching tabs never resizes the dialog) and forms
 * whose content reliably fills the frame. The body scrolls internally.
 */
export const formDialogClass =
  'w-full sm:max-w-2xl md:h-[min(88dvh,44rem)]';

/** Wide dialog — line-item editors (invoices/bills/journals), statement import. Natural height, viewport cap. */
export const wideFormDialogClass =
  'w-full sm:max-w-4xl md:max-h-[88dvh]';

/**
 * Consistent width + viewport cap, NATURAL height — use for ordinary
 * single-section forms (no tabs, variable length). Standardises the ~40
 * form dialogs on one width without forcing a tall empty frame on a short form.
 */
export const standardDialogClass = 'w-full sm:max-w-2xl md:max-h-[88dvh]';

/** Short, single-purpose forms (reopen period, override reason, allocate, small confirms with a field). */
export const compactDialogClass = 'w-full sm:max-w-lg md:max-h-[88dvh]';

/**
 * Min-height for a multi-tab form's panel region, when the form is NOT in a
 * fixed-height dialog (e.g. rendered inline on a page). Keeps the shortest
 * tab from collapsing the layout. Pair with `overflow-y-auto` on the same
 * wrapper if the tallest tab can exceed it.
 */
export const tabbedFormPanelsClass = 'min-h-[22rem]';

/** Record-detail sheet width (docs/CURRENT_TASKS.md #23) — sheets are already full-height. */
export const recordSheetClass = 'w-full sm:max-w-lg';
export const wideRecordSheetClass = 'w-full sm:max-w-xl';
