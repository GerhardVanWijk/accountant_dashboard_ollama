/**
 * Shared sizing standard for form & record-detail surfaces
 * (docs/CURRENT_TASKS.md #3, #4, #23 and P3B — the Vertex Form System).
 *
 * The problem this solves: `DialogContent` sizes to its content, so a
 * multi-tab form (Customer, Supplier, Company, Asset, ...) visibly
 * grows/shrinks the dialog every time you switch tabs — one tab has six
 * fields, another has none. Giving form dialogs a STABLE desktop height
 * (with the body scrolling internally) makes tab switches inert.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TWO LAYERS live in this file:
 *
 * 1. The P3B `FormSize` token model (`sm`/`md`/`lg`/`xl`) + the class maps
 *    `formSizeWidthClass` / `formSizeHeightClass` / `formSheetWidthClass`.
 *    `FormShell` (src/components/app/form/) is the ONLY thing that should
 *    read these — consumers pass `size`, never a raw class.
 *
 * 2. The legacy `*DialogClass` string constants, still consumed by the ~15
 *    un-migrated `*FormModal.tsx` components. Kept byte-stable so nothing
 *    shifts before its migration (P3D+). Once every consumer is on
 *    `FormShell`, this whole block is deleted.
 * ─────────────────────────────────────────────────────────────────────────
 */

/*
 * The legacy `*DialogClass` string constants that the ~30 pre-P3D `*FormModal`s
 * consumed were removed once every consumer moved to `<FormShell size>` (P3G).
 * `RecordDetailSheet` still owns `recordSheetClass` / `wideRecordSheetClass`.
 */

/* ============================ P3B token model ============================ */

/**
 * Form size tokens. Pick by the *shape* of the record, not its field count:
 *
 * - `sm`  — simple single-section forms: bank account, basic ledger account,
 *           a small settings record, a one-field override dialog.
 * - `md`  — standard master records: Customer, Supplier, Product, Employee,
 *           Company. The default.
 * - `lg`  — complex accounting transactions with a line-item editor: Invoice,
 *           Credit Note, Receipt, Bill, Supplier Payment, Journal Entry.
 * - `xl`  — multi-section / multi-step workflows: Bank Statement Import,
 *           reconciliation configuration, advanced accounting settings.
 */
export type FormSize = 'sm' | 'md' | 'lg' | 'xl';

export const FORM_SIZES: readonly FormSize[] = ['sm', 'md', 'lg', 'xl'] as const;

/** Width cap per size, for a form rendered in a Dialog. */
export const formSizeWidthClass: Record<FormSize, string> = {
  sm: 'sm:max-w-lg', //   32rem
  md: 'sm:max-w-2xl', //  42rem
  lg: 'sm:max-w-4xl', //  56rem
  xl: 'sm:max-w-6xl', //  72rem
};

/**
 * Height per size, for a form rendered in a Dialog.
 *
 * The base (mobile) rule is a plain viewport cap — the surface takes its
 * natural height up to `100dvh − 2rem`, body scrolling inside. From `md`
 * up, `md` / `lg` / `xl` switch to a FIXED height (`h-[min(cap, viewport)]`)
 * so switching tabs / toggling conditional sections never resizes the
 * frame (the STABLE FORM SIZE REQUIREMENT). `sm` forms stay natural-height
 * at every width — they have no tabs and little conditional content, so a
 * fixed frame would just be empty space.
 *
 * `dvh` (not `vh`) keeps it honest against mobile browser chrome.
 */
export const formSizeHeightClass: Record<FormSize, string> = {
  sm: 'max-h-[calc(100dvh-2rem)]',
  md: 'max-h-[calc(100dvh-2rem)] md:h-[min(calc(100dvh-2rem),44rem)]',
  lg: 'max-h-[calc(100dvh-2rem)] md:h-[min(calc(100dvh-2rem),52rem)]',
  xl: 'max-h-[calc(100dvh-2rem)] md:h-[min(calc(100dvh-2rem),56rem)]',
};

/** Height for a form that opts out of the fixed frame (`height="natural"`). */
export const formNaturalHeightClass = 'max-h-[calc(100dvh-2rem)]';

/** Width cap per size, for a form rendered in a right-side Sheet. */
export const formSheetWidthClass: Record<FormSize, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-xl',
  xl: 'sm:max-w-2xl',
};

/**
 * Base look of a form surface popup — brand-green hairline ring, popover
 * ground, enter/exit animation. Mirrors what `DialogContent` / `SheetContent`
 * bake in, extracted here so `FormShell` (which composes the base-ui
 * primitive directly, to own its own header/body/footer layout instead of
 * the generic `dialog-scroll-area` wrapper) stays visually identical to
 * every other dialog in the app.
 */
export const formDialogPopupBaseClass =
  'fixed top-1/2 left-1/2 z-50 flex w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-popover text-sm text-popover-foreground ring-1 ring-brand-outline outline-none duration-100 data-[open]:animate-in data-[open]:fade-in-0 data-[open]:zoom-in-95 data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95';

export const formSheetPopupBaseClass =
  'fixed inset-y-0 right-0 z-50 flex h-full w-3/4 flex-col overflow-hidden border-l bg-popover text-sm text-popover-foreground shadow-lg ring-1 ring-brand-outline transition duration-200 ease-in-out data-[ending-style]:translate-x-[2.5rem] data-[ending-style]:opacity-0 data-[starting-style]:translate-x-[2.5rem] data-[starting-style]:opacity-0';

export const formOverlayClass =
  'fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-[backdrop-filter]:backdrop-blur-xs data-[open]:animate-in data-[open]:fade-in-0 data-[closed]:animate-out data-[closed]:fade-out-0 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0';

/* ============================ record-detail ============================ */

/** Record-detail sheet width (docs/CURRENT_TASKS.md #23) — sheets are already full-height. */
export const recordSheetClass = 'w-full sm:max-w-lg';
export const wideRecordSheetClass = 'w-full sm:max-w-xl';
