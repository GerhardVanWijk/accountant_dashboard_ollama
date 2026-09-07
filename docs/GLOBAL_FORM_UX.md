# Global Form UX / Visual Refinement — 2026-09-07

Branch `global-form-ux-2026-09-07` (off `main`). **Frontend form UX only.** No
DTO, schema, migration, repository, posting, VAT, WAC, GL, or document-lifecycle
change. Migrations: NONE. DB writes: NONE. Accounting byte-identical.

## What already existed (the P3B "Vertex Form System")

The 2026-08-28 `FORM_SYSTEM_AUDIT.md` gap list was almost entirely closed
between then and now:

- `FormShell` (dialog / sheet, `size` `sm`/`md`/`lg`/`xl` → width + stable
  height), `FormHeader` / `FormBody` / `FormFooter` / `FormTabs` / `FormSection`
  — 52 forms already on it. Pinned header/footer, single scroll region,
  unsaved-changes guard, per-tab error dots: all done.
- Field primitives (`Field` / `FieldLabel` / `FieldError` / `FieldDescription`),
  `Input` (h-8), `Textarea`, `Checkbox` (size-4), `EnumSelect` /
  `SearchableSelect` / `*Combobox` — all height/border/focus consistent.
  Labels already `text-sm font-medium`.
- Native `<select>` **eliminated app-wide** — guarded by
  `noNativeSelect.global.test.ts`.

**One coherent form system — no conflicting architectures.** So this pass added
the missing layer, it did not redesign anything.

## New shared primitives (`src/components/app/form/`)

| Component | Purpose |
|---|---|
| `FormGrid` | The one responsive field grid. `columns` = `2` (default, 1→sm:2), `3` (1→sm:2→lg:3 for short-field clusters), or `1` (never splits). `gap-x-5 gap-y-4`. Replaces ~60 hand-rolled `grid grid-cols-1 gap-4 md:grid-cols-2` blocks across ~30 forms. |
| `FormField` | Optional convenience: bundles `FieldLabel` (+`RequiredMark`) + control + hint + `FieldError` into the standard vertical stack. `span="full"` → `col-span-full`. |
| `CheckboxField` | Boolean option as a horizontal `Checkbox` + label (+ optional description) row. `span="full"`. Replaces the hand-rolled `<input type="checkbox" className="size-4 rounded border-input">` copies in the RHF forms (wired through `Controller`). |
| `FormPageLayout` | Centered, width-capped shell for a form that lives on its own page. `size="standard"` → `max-w-4xl` (56rem); `size="document"` → `max-w-6xl` (72rem). `surface="card"` (default) or `"plain"`. Optional `backTo`. |

All exported from `@/components/app/form`. Tests: `FormGrid.test.tsx` (10).

## Global visual rules

- **Standard entity form width** — modal: `FormShell size="md"` (42rem). Page:
  `FormPageLayout size="standard"` (`max-w-4xl`, centered).
- **Document form width** — modal: `FormShell size="lg"` (72rem). Page:
  `FormPageLayout size="document"` (`max-w-6xl`, centered). Inside a document
  form the **metadata `FormGrid` is capped at `max-w-3xl`** (48rem) and the Notes
  field at `max-w-3xl`; only the line-item table / totals use the full width
  (docs brief §16, §18: "narrow header, wide lines").
- **Field grid** — `FormGrid`. 2-col default; 3-col (`columns={3}`) for
  short-field rows (address city/postal/country, cost/price/tax, warehouse/date/
  reason, bank name/branch/account). Long fields (`Description`, `Address line`,
  `Notes`, a full-width GL-account picker) → `col-span-full` / `span="full"`.
- **Labels** — unchanged: `FieldLabel` = `text-sm font-medium`, `RequiredMark`
  is `*` + an `sr-only` "(required)".
- **Inputs / selects / checkboxes** — unchanged shared primitives; `h-8`
  controls, `size-4` checkbox, brand focus ring, themed select popups.
- **Tabs** — unchanged: the `line` variant's active tab is brand-green label +
  brand underline (deliberately not bold — bold would reflow the tab row).
- **Modal sizing** — the existing `sm`/`md`/`lg`/`xl` `FormShell` tokens already
  serve the "small / medium / large / document" intent; not renamed (churn/risk).

## Forms migrated to `FormGrid` / `CheckboxField`

- **Inventory** — ProductForm, CategoryForm, WarehouseForm,
  StockAdjustmentDocumentForm, StockTransferDocumentForm,
  OpeningStockBatchDocumentForm, StockTakeSetupForm, SupplierReturnDocumentForm.
- **Purchases** — BillForm, PurchaseOrderForm, PaymentForm.
- **Sales** — InvoiceForm, QuoteForm, SalesOrderForm, CreditNoteForm,
  CustomerReceiptForm.
- **Customers** — CustomerForm (all 4 tabs; 2 raw checkboxes → `CheckboxField`).
- **Suppliers** — SupplierForm (all 4 tabs; `onHold` → `CheckboxField`) +
  SupplierFormPage → `FormPageLayout`.
- **Accounting** — AccountForm (`isActive` → `CheckboxField`), JournalEntryForm.
- **Banking** — BankAccountForm, TransactionForm (both tab bodies).
- **Admin** — CompanyForm (all sections; 4 raw checkboxes → `CheckboxField`).
- **Assets** — AssetForm, DisposeAssetForm.
- **Tax** — TaxRateForm, SupersedeTaxRateForm, DividendDeclarationForm.
- **Leases** — LeaseForm.
- **Related parties** — RelatedPartyTransactionForm.
- **Employees** — EmployeeForm (7 grids; `uifExempt` → `CheckboxField`),
  PayrollRunForm.
- **Foreign exchange** — ExchangeRateForm.
- **Page forms → `FormPageLayout`** — SupplierFormPage, CreateDeliveryNotePage,
  CreateReturnNotePage (the last two also dropped their bespoke
  `h-9 rounded-md` input string for the shared `Input` / `Field` / `Textarea` /
  `FormError`).

## Not changed (and why)

- **Radio groups (§11)** — no `RadioGroup` component exists; the only radio usage
  is `FxCalculatorPage` (a calculator, not a form). Nothing to standardise.
- **Services module (§27)** — does not exist in the codebase.
- **The ~27 "page-inline ad-hoc dialogs" from the 2026-08-28 audit** — already
  migrated to `FormShell` in P3D–P3G. Nothing left to do.
- **Three bespoke non-form-field checkboxes** (LineItemsEditor "Asset" toggle,
  StatementImportWizard "Import anyway", OpeningStockBatchDetailPage confirm) —
  left as native `<input type="checkbox">` (given a shared class). They sit in
  wrapping `<label>`s with no `htmlFor`; base-ui `Checkbox`'s button/hidden-input
  split changes `getByLabelText` semantics and broke their existing tests for no
  real visual gain.
- **`CompanyForm` in a `md` modal** — long but scrolls internally; not worth a
  tabbed rebuild this pass.

## Responsive

- **Desktop** — 2 columns (3 for short-field rows); page forms centred in a
  4xl/6xl column instead of stretching a 1600px monitor edge-to-edge.
- **Tablet** — 2 columns from `sm`; `lg:grid-cols-3` collapses to 2.
- **Mobile** — every `FormGrid` is `grid-cols-1`; `FormPageLayout`'s `mx-auto`
  + `max-w-*` is a no-op below the cap. Modal shells already viewport-capped.

## Business logic

Accounting changed: **NO**. DTO behaviour changed: **NO**. Database changed:
**NO**. `CreateDeliveryNotePage` / `CreateReturnNotePage` swapped raw
`<input>`/`<label>`/`<textarea>` for the shared primitives — same values, same
handlers, same submit payload.

## Gate

- TypeScript: PASS
- ESLint (`--max-warnings 0`): PASS
- Tests: **2953 / 356 files PASS** (+10 `FormGrid.test.tsx`)
- Build: PASS
