# Vertex Form System — Inventory & Gap Analysis (Agent 12, 2026-08-28)

Investigation for `docs/CURRENT_TASKS.md` → `BANK_STATEMENT_RECONCILIATION_AND_FORM_SYSTEM` PART 0.5 / 0.6.
Read-only. No code written.

> **Two headline conclusions below are superseded (2026-09-03, live browser QA) — see
> `docs/CURRENT_TASKS.md` → `# RECORD DETAIL FULL-PAGE MIGRATION`:**
> - *"Dark selects: 100% done"* — the `globals.css` `select option { … }` rule is **not**
>   honoured by the browser on the deploy; native option menus still render light. Fix is
>   `EnumSelect` (small enums) / `SearchableSelect` + `*Combobox` (entity lists) — base-ui
>   dark popups, not CSS. **DONE (transaction forms):** every inventory + sales + purchases
>   transaction form (line editors, allocation, method, reason, invoice picker).
>   **DONE (everything else, 2026-09-03 GLOBAL SELECT MIGRATION):** all ~34 non-transaction
>   forms too (admin / auth / settings / customers / suppliers / employees / assets /
>   relatedParties / accounting / banking / tax / compliance / financialInstruments / reports /
>   import). **Zero** native `<select>` app-wide now, guarded by
>   `src/components/app/combobox/noNativeSelect.global.test.ts`.
> - *"Detail side: 100% unified via `RecordDetailSheet` — leave it"* — reversed. Complex
>   records (line items / actions / accounting / tabs) move to **full-page routes**
>   (`/module/records/:id`). **DONE:** all 13 (Sales Order, Inventory Item, Quote, Invoice,
>   Credit Note, Customer Receipt, PO, Bill, Supplier Payment, Stock Adjustment / Transfer /
>   Take, Supplier Return, Opening Stock) — 15 `*DetailSheet`/`*Detail` files deleted.
>   **KEPT as sheet:** Bank Account/Transaction, Customer, Supplier, Employee, GL Account,
>   Fixed Asset, Lease.

## Headline numbers
- **~45 form surfaces** total.
- **14** use the shared `form-surface.ts` size classes; **~27** page-inline `<DialogContent className="max-w-*">` use none of it; **7** `AlertDialog` confirmations hand-write everything.
- **The entire Purchases domain** (Bill / Supplier Payment / Purchase Order) has **no `*FormModal` layer** — pages inline `max-w-3xl` dialogs. Most inconsistent module.
- **`DialogFooter` exists and is sticky, but is ignored by 40 files** which hand-roll `<div className="flex justify-end gap-2 border-t border-border pt-4">` *inside* the scroll area → action row scrolls with the body in every non-tabbed form.
- **3 tabbed editable forms** (Customer, Supplier, Transaction) each hand-roll the fixed-height + internal-scroll recipe with 3 different heights (`min-h-0 flex-1`, `h-[28rem]`, `h-[30rem]`). `SettingsPage` + 2 detail pages have tabs with no height stabilisation.
- **Dirty-state / unsaved-changes: nonexistent** — 0 files. Every modal discards edits silently on close.
- **Validation UX split in two**: ~16 RHF+zod master-data forms (`Field`/`FieldError`, per-field errors) vs ~11 useState document/transaction forms (single `formError` banner, no per-field errors). Server-error placement inconsistent even within tier 1. No required-field markers anywhere.
- **Dark selects: 100% done** — ~~`globals.css` rule + `NativeSelect` everywhere~~ **superseded**: every
  dropdown is now `EnumSelect` / `SearchableSelect` (base-ui dark popup); **0** native `<select>` /
  `NativeSelect` app-wide, guarded by `noNativeSelect.global.test.ts` (2026-09-03).
- **Detail side: 100% unified** — all 17 record-detail surfaces go through `RecordDetailSheet`; none internally tabbed. Leave it.

## `form-surface.ts` today
| Export | Value | Consumers |
|---|---|---|
| `formDialogClass` | `w-full sm:max-w-2xl md:h-[min(88dvh,44rem)]` (fixed h) | CustomerFormModal, CompanyPage (2) |
| `wideFormDialogClass` | `w-full sm:max-w-4xl md:max-h-[88dvh]` | 9 modals (Invoice, CreditNote, Quote, SalesOrder, CustomerReceipt, Transaction, StatementImport, AllocateTransaction, JournalEntry) |
| `standardDialogClass` | `w-full sm:max-w-2xl md:max-h-[88dvh]` | AccountFormModal, BankAccountFormModal (2) |
| `compactDialogClass` | `w-full sm:max-w-lg md:max-h-[88dvh]` | AllocationFormModal (1) |
| `tabbedFormPanelsClass` | `min-h-[22rem]` | **0** |
| `recordSheetClass` / `wideRecordSheetClass` | `sm:max-w-lg` / `sm:max-w-xl` | indirect / ad-hoc |

Baked into `DialogContent` already: brand-green `ring-1 ring-brand-outline`, viewport cap, `dialog-scroll-area` internal-scroll body, `sticky` `DialogHeader`, `sticky` `DialogFooter` (unused). `AlertDialogContent` deliberately neutral ring + small widths.

## Full inventory (condensed — see Agent 12 task transcript for the complete tables)

**A. `*FormModal` + `form-surface.ts` (13):** CustomerForm*(tabbed), InvoiceForm, CreditNoteForm, QuoteForm, SalesOrderForm, CustomerReceiptForm, AllocationForm, TransactionForm*(tabbed), StatementImportPanel*(wizard), BankAccountForm, AllocateTransactionForm, JournalEntryForm, AccountForm.

**B. Full-page forms on shared classes (2):** SupplierFormPage→SupplierForm*(tabbed, `h-[28rem]`), CompanyPage→CompanyForm.

**C. Page-inline ad-hoc `max-w-*` dialogs, NOT on form-surface.ts (~27):** UsersPage (×3), ProductsPage, WarehousesPage (×3: product/transfer/adjustment), AssetRegisterPage (×2), DisposalsPage, DepreciationPage, EmployeesPage, PayrollRunsPage (×3), LeaseRegisterPage (×2), LeaseAmortizationPage, TaxRatesPage (×2), ExchangeRatesPage, RelatedPartyRegisterPage, RelatedPartyTransactionsPage, DividendsTaxPage, IncomeTaxPage (SBC), ReportingStandardsPage, PublicInterestScorePage (×2), PurchaseOrdersPage, BillsPage (×2), PaymentsPage, ReopenPeriodDialog.

**D. Record-detail (17, all via `RecordDetailSheet`, all DETAIL, none tabbed):** Customer, Supplier, BankAccount, BankTransaction, Invoice, CreditNote, CustomerReceipt, Quote, SalesOrder, PurchaseOrder, Bill, Payment, Account, Product, Asset, Lease, Employee.

**E. `AlertDialog` confirmations (7, no shared wrapper, no `ConfirmDialog`/`useConfirm`):** delete role, delete bank txn, delete supplier, delete draft invoice, void credit note, delete quote, delete sales order.

**F. Tabbed non-forms with NO height stabilisation:** SettingsPage (4 tabs), CustomerDetailPage, SupplierDetailPage, BankReconciliationPage (`line` variant).

**G. Auth pages (RHF):** Login, SignUp, ForgotPassword, ResetPassword, Onboarding (wizard).

**Requested-list gaps:** no dedicated form for Product Category (free-text field on ProductForm), no "Expense" entity (closest: AllocateTransactionForm / direct TransactionForm), Bank Reconciliation is a workspace page not a form, Financial Period has only ReopenPeriodDialog, Accounting Settings is a link hub.

## Proposed Vertex Form System — build vs adopt

**Build (smallest viable set — removes ~90% of duplication, fixes both visible bugs):**
1. `FormShell` — Dialog / Sheet / page variants, `size` prop (`small` | `medium` | `large` | `wide`), owns the dirty-close guard. Wraps existing `DialogContent`.
2. `FormFooter` — sticky, Cancel / primary / optional-destructive slots, built-in pending state, server-error slot. Replaces 40 hand-rolled divs.
3. `FormTabs` — `flex min-h-0 flex-1 flex-col` + `.app-scroll` panels + per-tab error badges. Consolidates the 3 hand-rolled copies = the global tab-resize fix.
4. `useUnsavedChangesPrompt(isDirty)` + `beforeunload`.

**Cheap add-ons same pass:** `FormSection` (fieldset+legend, mirror `RecordDetailSection`), `FormError` (root/server error, required-field marker), size-token rename (`compact/standard/formDialog/wideForm` → `small/medium/large/wide` + docs), `ConfirmDialog`/`useConfirm` (collapses the 7 AlertDialogs, standardises destructive red).

**Adopt as-is / leave:** `DialogHeader`/`SheetHeader` (→ `FormHeader`), `RecordDetailSheet` + sections (detail side already unified), `NativeSelect` + globals.css (done).

**Migration long-poles:** the 11 useState document/transaction forms (different validation model, embedded line-item editors, no `isDirty` — candidate for RHF+zod migration); the Purchases domain (needs shells built, not swapped); `StatementImportPanel` (multi-step wizard shell).

## Suggested migration order
1. Build the 4 core primitives + cheap add-ons. No behaviour change.
2. **Banking/reconciliation forms first** (critical path for this phase): TransactionForm, AllocateTransactionForm, StatementImportPanel/Modal, BankAccountForm — before Parts K–L build on them.
3. The 3 tabbed forms → `FormTabs` + `FormShell` (Customer, Supplier, Company).
4. Purchases domain — build BillFormModal / PaymentFormModal / PurchaseOrderFormModal.
5. Sales document forms + JournalEntry → `FormShell`/`FormFooter`; RHF+zod where practical.
6. Long tail of ~27 page-inline dialogs (mechanical) + `ConfirmDialog` for the 7 AlertDialogs.
7. Tabbed non-forms (SettingsPage, detail pages) → shared height logic.
