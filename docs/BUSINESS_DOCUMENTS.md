# Global Professional Business Documents (Phase 4B)

`src/features/businessDocuments/` — one reusable A4 print / PDF document system for **Quote,
Sales Order, Tax Invoice / Invoice, Credit Note and Purchase Order**. Opened from the
**Print / PDF** action on each `*DetailPage`; renders an on-screen preview and prints a clean
white sheet regardless of the app theme.

**No accounting behaviour lives here.** Adapters consume the stored
`subtotal` / `taxTotal` / `total` / `amountPaid` verbatim — VAT / WAC / COGS / journal posting /
receipt allocation are never touched.

---

## Architecture

```
businessDocuments/
  types.ts                         BusinessDocumentViewModel + sub-types — the PRIVACY BOUNDARY
  adapters/
    shared.ts                      party mapping, line mapping, qty/currency fmt, column detection, footer
    quoteToBusinessDocument.ts
    salesOrderToBusinessDocument.ts
    invoiceToBusinessDocument.ts
    creditNoteToBusinessDocument.ts
    purchaseOrderToBusinessDocument.ts
    __fixtures__.ts                 UUID-stuffed fixtures shared by the tests
  components/
    BusinessDocument.tsx           the A4 sheet (header / parties / meta / lines / totals / notes / footer as one file)
    BusinessDocumentPreviewModal.tsx
    printBusinessDocument.ts        body-class toggle + window.print() + afterprint cleanup
  hooks/
    useBusinessDocument.ts          { kind, record } -> loads company / party / products / tax rates / bank / refs -> ViewModel
  businessDocuments.css             screen preview + @media print rules (imported once from index.ts)
  index.ts
```

Data flow:

```
*DetailPage
  └─ useBusinessDocument({ kind, record })
       └─ useCompany / useCustomerList | useSuppliers / useProducts / useAllTaxRates
          / useBankAccounts / useInvoices / useQuotes / useSalesOrders
       └─ <kind>ToBusinessDocument(record, ctx)   ← pure adapter, explicit field-picking
       └─ BusinessDocumentViewModel  (id-free)
  └─ <BusinessDocumentPreviewModal viewModel=… />
       └─ <BusinessDocument viewModel=… />         ← presentational only
```

---

## The view model (`types.ts`)

`BusinessDocumentViewModel` is an **allow-list** of business-facing fields. It has **no** `id`,
`*Id`, `journalEntryId`, `companyId`, `createdAt`, `updatedAt`, `status`, `allocations`,
`originalInvoiceLineId`, posting key, or seed reference — and never will.

```ts
export type BusinessDocumentKind =
  | 'quote' | 'sales_order' | 'tax_invoice' | 'invoice' | 'credit_note' | 'purchase_order';

export interface BusinessDocumentParty {
  name: string;
  tradingAs?: string;
  registrationNumber?: string;
  vatNumber?: string;
  incomeTaxNumber?: string;      // issuer only, tax invoice / credit note only
  addressLines?: string[];       // pre-joined from Address — never the raw object
  email?: string;
  phone?: string;
  website?: string;
  accountReference?: string;     // customer / supplier number — business-facing, OK
  contactPerson?: string;
}

export interface BusinessDocumentLine {
  description: string;
  code?: string;                 // SKU
  quantity: string;              // formatted, trailing-zero-trimmed
  unit?: string;                 // product uom, only if present
  unitPrice: string;             // formatted currency
  vatLabel?: string;             // "15%" / "Zero-rated" / "Exempt"
  amount: string;                // formatted currency (stored lineTotal)
}

export type BusinessDocumentLineColumn =
  'code' | 'description' | 'quantity' | 'unit' | 'unitPrice' | 'vat' | 'amount';

export interface BusinessDocumentTotalRow { label: string; value: string; emphasis?: boolean; }

export interface BusinessDocumentPaymentInfo {
  bankName: string; accountName: string; accountNumber: string;
  branchCode?: string; swiftCode?: string; reference: string;
}

export interface BusinessDocumentBranding {
  logoDataUrl?: string;          // null today — no logo storage
  issuerDisplayName: string;     // company.name, rendered as a wordmark when no logo
  footerText: string;            // exact string, dynamic year
}

export interface BusinessDocumentMetaField { label: string; value: string; }

export interface BusinessDocumentViewModel {
  kind: BusinessDocumentKind;
  title: string;                 // "TAX INVOICE" | "INVOICE" | "QUOTE" | "SALES ORDER" | "CREDIT NOTE" | "PURCHASE ORDER"
  documentNumber: string;
  issuedOnLabel: string;
  issuedOn: string;
  secondaryDateLabel?: string;
  secondaryDate?: string;
  issuer: BusinessDocumentParty;
  recipient: BusinessDocumentParty;
  recipientHeading: string;      // "Bill to" | "Prepared for" | "Credit to" | "Supplier"
  shipTo?: string[];
  meta: BusinessDocumentMetaField[];
  columns: BusinessDocumentLineColumn[];
  lines: BusinessDocumentLine[];
  totals: BusinessDocumentTotalRow[];
  notes?: string;
  terms?: string;
  paymentInfo?: BusinessDocumentPaymentInfo;
  branding: BusinessDocumentBranding;
  isTaxDocument: boolean;
}
```

### How internal identifiers are structurally excluded

Three layers, each independent:

1. **The type.** `BusinessDocumentViewModel` simply has no field that could hold a UUID / FK /
   journal id. A template component only ever receives this type.
2. **Explicit field-picking in adapters.** Every adapter builds the VM field by field
   (`issuer: issuerParty(company)`, `documentNumber: invoice.invoiceNumber`, …). A domain object
   is **never** spread (`...invoice`) into the VM, so a new internal column on a domain type can't
   ride along.
3. **`noInternalIds.test.tsx` scan.** Renders all 5 document kinds from fixtures whose ids are
   real-looking UUIDs and asserts `container.textContent` matches none of
   `/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i`, `/journal/i`, `/posting key/i`, `/company_id/i`,
   `/seed/i`, `/Page \d+ of/i` — and that the exact Vertex footer IS present.

---

## Branding & footer

| Element | Source |
|---|---|
| Issuer logo / name | `company.logo` (base64 data URL, migration 0047) as an `<img>`; otherwise a **text wordmark** of `company.tradingName || company.name` |
| Issuer reg / VAT / income-tax no. | `company.registrationNumber` / `vatRegistrationNumber` / `incomeTaxNumber` (income-tax number only on a tax invoice / credit note) |
| Issuer trading-as / address / phone / email / website | `company.tradingName` / `documentAddress` / `phone` / `email` / `website` (migration 0047 — all optional, blank ⇒ omitted) |
| `isTaxDocument` / "TAX INVOICE" vs "INVOICE" | `company.isVatRegistered` |
| Recipient | `Customer` (`billingAddress`, `email`, `phone`, `taxNumber`, `customerNumber`, primary contact) or `Supplier` (`address`, `email`, `phone`, `taxNumber`, `supplierNumber`, `contactPerson`) |
| Line SKU / unit | resolved `Product.sku` / `Product.uom` (columns shown only when at least one line has one) |
| VAT label | concise `TaxRate` treatment/rate ("15%", "Zero-rated", "Exempt") — **not** the verbose dropdown string; an unresolvable id is omitted, never "Unknown" |
| Payment information (invoice only) | the bank account the company nominated in Company Settings (`companies.documents_bank_account_id`, migration 0047) **and** that is still `active`; **omitted** otherwise — no fallback guessing |

### Phase 4B-2 — the company document profile (migration 0047, AUTHORED, NOT APPLIED)

Since Phase 4B-2 the issuer identity comes from ONE authoritative source: the `companies` row.
`adapters/shared.ts` reads it:

| VM field | Source (`Company`) |
|---|---|
| `branding.logoDataUrl` | `company.logo` — a base64 data URL (`data:image/png;base64,…`), NOT a Storage URL. Unset ⇒ text wordmark. |
| `branding.issuerDisplayName` | `company.tradingName || company.name` |
| `issuer.tradingAs` | `company.tradingName` (parties block; suppressed in the header where the wordmark already is it) |
| `issuer.addressLines` | `company.documentAddress` (jsonb `Address`) joined, empty parts dropped |
| `issuer.email / phone / website` | `company.phone` / `email` / `website` |
| `terms` (all 5 doc kinds) | `resolveDocumentTerms(documentSpecificTerms, company)` → a document-specific override (none exist yet) else `company.documentTerms`; `undefined` ⇒ block omitted |
| `paymentInfo` (invoice) | `resolveDocumentsBankAccount(company, bankAccounts)` → the account whose id === `company.documentsBankAccountId` **and** `status === 'active'`; else `undefined`. Resolved in `useBusinessDocument`, passed as `ctx.bankAccount`. |

`resolveDocumentsBankAccount` does **not** re-check "same company" — `useBankAccounts()` is
company-scoped at the repository layer and the `BankAccount` domain type carries no `companyId`.
The "exactly one active bank account" fallback from Phase 4B has been **removed**.

**The Vertex footer stays global.** Company Settings has no field that can touch
`branding.footerText` — `businessDocumentFooterText(now)` is unchanged, exact string, dynamic year.
No white-labelling.

#### Storage decision — data-URL column, not a Supabase Storage bucket

This project has never used Supabase Storage (`storage.buckets` empty, no `storage.objects`
policies). The logo is a single nullable `text` column on `companies` holding a base64 data URL:

- inherits the `companies` row's tenant isolation exactly — no bucket, no new RLS policy, no
  cross-company object-enumeration surface;
- renders in the print view with zero network fetch and zero CSP risk;
- smallest additive change.

The Company Settings form enforces the mime allow-list (`image/png`, `image/jpeg`, `image/webp`,
`image/svg+xml`) and a **512 KB** pre-encode size cap **client-side**, reads the file to a data
URL, and preserves aspect ratio in CSS (`max-h`, `w-auto`, `object-contain`).

**Alternative: a private Storage bucket.** A `company-logos` bucket with an RLS policy scoped to
the caller's company, `logo_path` on `companies`, and a signed-URL (or fetch → data URL at print
time) read path is a valid future choice — it keeps large logos out of the row and off every
`select *`. It is **not** built here: it needs its own security-review cycle (bucket policy,
signed-URL lifetime, CSP for the object host), and the data-URL column is sufficient for the
≤ 512 KB logos this form accepts.

#### Authored migration `0047_company_document_profile` (NOT APPLIED)

```sql
alter table companies
  add column if not exists trading_name              text,
  add column if not exists logo                      text,   -- base64 data URL; NULL = no logo
  add column if not exists document_address          jsonb,  -- an Address object, same shape as customers.billing_address
  add column if not exists phone                     text,
  add column if not exists email                     text,
  add column if not exists website                   text,
  add column if not exists document_terms            text,
  add column if not exists documents_bank_account_id uuid
    references bank_accounts(id) on delete set null;
```

All nullable, no defaults, no backfill. Every column NULL ⇒ documents render exactly as before
(wordmark, no address, no terms, no payment block). The live `Office National Demo (Pty) Ltd` row
is **not** populated — no address / phone / email / website / logo / terms / bank pointer is
invented. `on delete set null` so deleting a bank account cannot orphan the FK or block the delete.

#### Privacy — the new FK never renders

`documents_bank_account_id` is resolved to a `BankAccount` in `useBusinessDocument` and only its
**human** fields (bank name, account number, branch code, SWIFT) reach `BusinessDocumentPaymentInfo`.
The id is never placed on the view model. `noInternalIds.test.tsx` renders an invoice whose company
carries a real-UUID `documentsBankAccountId` + a resolved account and asserts the UUID appears
nowhere while the bank details do; it also asserts the logo renders as `<img src="data:…">` and the
base64 blob is not dumped as text.

**Footer text (exact):**

```
Generated with Vertex Accounting Solutions • {year} • All rights reserved.
```

`{year}` is `new Date().getFullYear()` — computed at render, **never hardcoded**. There is no
Vertex legal entity anywhere in the app, so none is invented.

---

## A4 / print strategy (`businessDocuments.css`)

- **Screen:** `.business-document` is `max-width: 210mm`, centred, `padding: 16mm`, with a subtle
  shadow and `min-height: 297mm` (screen only, so an empty sheet still reads as a page). The
  preview modal floats it on a grey canvas (`.business-document-print-root`).
- **White paper always.** The sheet is `bg-white text-neutral-900` (literal Tailwind classes) and
  the CSS re-asserts `background:#fff; color:#171717`. No `dark:` variants anywhere on the sheet —
  the app theme cannot darken printed paper. This is the **one documented exception** to the
  semantic-token rule in `docs/DO_NOT_BREAK.md` (there is no eslint colour rule, so there is
  deliberately **no** eslint-disable directive — an unused one would fail
  `lint --report-unused-disable-directives`).
- **Print:** gated on `body.printing-business-document` (added by `printBusinessDocument()` just
  before `window.print()`, removed on `afterprint` with a 2 s timeout fallback):
  - `#root` is hidden; the portal-hosted `[data-slot="dialog-content"]` is promoted to static
    flow (`position: static`, no transform, `overflow: visible`, no ring/shadow) so the sheet
    **paginates naturally** across pages.
  - `@page { size: A4; margin: 14mm }`.
  - `.business-document__lines thead { display: table-header-group }` (header repeats per page);
    `tr` / `.business-document__totals` / `.business-document__footer` / `.business-document__payment`
    / `.business-document__parties` get `break-inside: avoid`.
  - The **footer flows at the end of the content** — no `position: fixed`, no page numbers
    (avoids the fixed-element / overlap pitfalls).
  - The pre-existing app-wide `@media print` block in `src/styles/globals.css` (hides sidebar /
    topbar / toaster) still applies underneath as a safety net.
- **Browser header/footer:** the preview modal tells the user to turn off "Headers and footers"
  in the print dialog so the page URL / date don't print over the document.

---

## Per-document support

| | Title | Issuer income-tax no. | Secondary date | Payment block | Meta fields |
|---|---|---|---|---|---|
| **Quote** | `QUOTE` | no | Valid until (`expiryDate`) | – | Customer account |
| **Sales Order** | `SALES ORDER` | no | – (no field exists) | – | Customer account · Quote reference |
| **Invoice** | `TAX INVOICE` / `INVOICE` (per `isVatRegistered`) | yes | Due date | if 1 active bank acct | Customer account · Payment terms · Sales order reference |
| **Credit Note** | `CREDIT NOTE` (rose title + "Total credit") | yes | – | – | Customer account · Against invoice · Reason (+ detail when `other`) |
| **Purchase Order** | `PURCHASE ORDER` | no (issuer is the buyer) | Expected delivery (`expectedDate`, if set) | – | Supplier account |

- Line columns are always `description, quantity, unitPrice, vat, amount`; `code` is prepended and
  `unit` inserted after `quantity` **only** when at least one line resolves that value.
- Invoice totals: `Subtotal, VAT, Total`; plus `Amount paid` + `Balance due` (`total - amountPaid`)
  **only when `amountPaid > 0`**.
- Redundant header/meta: document number and dates live in the header block; the `meta` strip
  carries only the *other* references (account, terms, source docs, reason) — it does not repeat
  the number/date.

### Data gaps rendered as clean omissions (not invented)

- **Sales Order** has no delivery address, customer-PO reference, or expected-delivery field.
- **`DocumentLineItem`** has no per-line discount field → there is no Discount column.
- **Ship-to / "Deliver to"** only renders when a distinct `customer.shippingAddress` exists
  (rare today) — otherwise omitted.

---

## Actions

| Action | Quote | Sales Order | Invoice | Credit Note | Purchase Order |
|---|---|---|---|---|---|
| **Print / PDF** (opens the A4 preview) | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Duplicate / Copy** (→ new **draft**, new number, today's date, fresh line ids, party + notes; navigates to the copy) | ✅ `quoteService.duplicateQuote` | ✅ `salesOrderService.duplicateSalesOrder` (drops `quoteId`) | ✅ `invoiceService.copyToNewDraftInvoice` (drops `journalEntryId` / `amountPaid` / `salesOrderId`) | ❌ (corrected by a further credit note, never copied) | ✅ `purchaseOrderService.duplicatePurchaseOrder` (drops `billId` / `journalEntryId` / `receivedDate` / `expectedDate`) |
| **Export** (CSV / Excel *data*) | deferred — `ExportMenu` stays list-oriented; not added to record pages this phase |
| **Edit / lifecycle** | unchanged — every existing Edit / Mark-as-sent / Record-payment / Issue / Allocate / Convert action and every immutability guard is untouched |

The duplicate service methods write a draft through the existing repo `.create` (via each
service's own `create*` where a line projector is involved). They do **not** post to the GL and do
**not** run against live data in this phase. `nextDocumentNumber` +
`documentNumberPrefix` (`src/features/purchases/utils/nextDocumentNumber.ts`) keep the copy on the
source's own `PREFIX-YYYY-NNNN` convention.

**Duplicate/Copy audit trail (Phase 4B-2).** `QuoteService` / `SalesOrderService` /
`PurchaseOrderService` / `InvoiceService` each take an optional `auditLog: AuditLogService`
constructor parameter (defaulting to the shared `auditLogService` singleton — every existing call
site is unaffected). After the new draft is created, the duplicate method writes one
`auditLog.log({ userId: SYSTEM_USER_ID ('system'), action: 'created', module: 'sales' | 'purchases',
recordType: 'Quote' | 'SalesOrder' | 'PurchaseOrder' | 'Invoice', recordId: <new id>,
reason: 'Duplicated from <source number>', newValue: { copiedFromNumber: <source number> } })`.
The source is named by its **human document number**, never its id. `duplicate*` / `copyToNewDraftInvoice`
take an optional `duplicatedBy` / `copiedBy` actor argument defaulting to `'system'` (same
default-actor pattern as `stockAdjustmentService.postAdjustment`). Success feedback is still the
navigation to the new record page + the standard inline error banner on failure (this codebase's
`*DetailPage` convention), not a toast.

---

## Company Settings — the "Document & branding" section (Phase 4B-2)

Delivered as: migration `0047` (AUTHORED, NOT APPLIED — see the SQL and rationale above), the
optional `Company` fields (`tradingName`, `logo`, `documentAddress`, `phone`, `email`, `website`,
`documentTerms`, `documentsBankAccountId`), the snake_case ↔ camelCase mapping in
`SupabaseCompanyRepository` (jsonb `document_address` ↔ `Address`, same as the customer repo), and a
new "Document & branding" section in `CompanyForm` + `companyFormSchema` + a card on `CompanyPage`.

The section carries: trading name, a client-validated logo upload (png/jpeg/webp/svg, ≤ 512 KB →
data URL, replace / remove, aspect ratio preserved), a jsonb document address (line1/line2/city/
state/postalCode/country), phone / email / website, a default-document-terms textarea, and a
"Bank account shown on documents" `NativeSelect` over the company's bank accounts with a
"None — omit the payment block" option. The patch mapping always includes these keys (as a value
or `undefined`) so an emptied field / removed logo is written through as SQL `NULL` rather than
silently skipped.

## Icon rule — resolution (Phase 4B-2)

Phase 4B added `print: Printer` to the `Icons` registry (`src/config/icons.ts`). That was
**reverted** in Phase 4B-2. `BusinessDocumentPreviewModal.tsx` and the 5 detail pages import
`{ PrinterIcon }` from `lucide-react` **directly** — consistent with the `PencilIcon` import two
lines above it in the same files. `docs/DO_NOT_BREAK.md` names `src/config/icons.ts` +
`src/components/ui/Icon.tsx` as the only files allowed to import `lucide-react`, but
`src/components/ui/Icon.tsx` **does not exist** and the `Icons` registry is currently unused by any
component — the direct import is the established real pattern in this v0-era part of the codebase.
The registry addition was unnecessary and was removed.

---

## Human QA still required

There is **no Chrome DevTools / Playwright MCP in this environment.** The actual printed output —
A4 pagination, page breaks inside the line table, the browser print dialog with headers/footers
off, PDF export from the print dialog, dark-theme-app → white-paper — has **not** been visually
verified. A human must open a Quote / Invoice / Credit Note / PO detail page on the deploy, click
**Print / PDF**, and check the sheet + a real print preview.
