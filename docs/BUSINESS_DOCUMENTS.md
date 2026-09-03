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

export interface BusinessDocumentVertexFooter {
  generatedLine: string;         // "Generated with Vertex Accounting Solutions"
  rightsLine: string;            // "© {year} Vertex Accounting Solutions. All rights reserved."
}

export interface BusinessDocumentBranding {
  logoDataUrl?: string;          // base64 data URL (migration 0047); unset ⇒ text wordmark
  issuerDisplayName: string;     // company.tradingName || company.name, rendered as a wordmark when no logo
  vertexFooter: BusinessDocumentVertexFooter;   // two plain strings, dynamic year already baked in
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
  issuerHeading: string;         // "From"
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
   `/seed/i`, `/Page \d+ of/i` — and that the Vertex footer IS present.

---

## Layout (Phase 4B-VISUAL)

The A4 sheet, top to bottom:

1. **Letterhead header** — logo (`<img>`, `max-h-20 max-w-[280px] object-contain`) or, with no logo, a
   text wordmark of `company.tradingName || company.name`; on the right the document **title**,
   **number** and **date(s)**. **Nothing else** — the issuer address / reg / VAT / contact block was
   removed from the header in Phase 4B-VISUAL. Thinner bottom padding so the content starts higher.
2. **Parties row** — a real two-column grid (`.business-document__parties-grid`,
   `grid-cols-2 gap-8`): the **issuer LEFT** under a `From` heading (`vm.issuerHeading`) with the full
   identity block (legal name, `t/a`, address, contact, phone/email/website, reg no., VAT no.,
   income-tax no. on tax docs), the **recipient RIGHT** under `vm.recipientHeading` ("Bill to" /
   "Prepared for" / "Credit to" / "Supplier"). The grid is pinned to two columns **in `@media print`
   too** — a responsive rule must never stack it. A rare `shipTo` renders as a full-width "Deliver
   to" block *below* the grid, never as a third column. `break-inside: avoid`.
3. **Meta strip** — the remaining references only (payment terms, source-doc numbers, credit-note
   reason). The customer/supplier account is **no longer here** — see below.
4. **Line table** — uppercase tracked header, a 2px rule under it, hairline row separators,
   description left / figures right (`tabular-nums`). Authoritative values unchanged.
5. **Totals** — right-aligned, `max-w-[16rem]`; the grand total is `text-base font-bold` with a 2px
   rule above (rose for a credit note).
6. **Lower section** (`.business-document__lower`) — for an **invoice that carries payment info**, a
   two-column row: notes + terms LEFT, "Payment information" RIGHT. Otherwise notes + terms stacked
   full width. Terms: `text-[11px] leading-relaxed max-w-[38rem] whitespace-pre-wrap` — wraps
   naturally, never truncated. `break-inside: avoid`.
7. **Footer** — the shared Vertex footer (below). One per sheet, flowing at content end.

### Account shown once

`PartyIdentity` prints `Account: {accountReference}` in the party block. The
`metaField('Customer account' / 'Supplier account', …)` entry was **removed from every adapter** in
Phase 4B-VISUAL so the account number appears exactly once — in the recipient party block, not also
in the meta strip. (Quote and Purchase Order now have an empty `meta` array.)

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

### Vertex footer (Phase 4B-VISUAL redesign)

`branding.footerText` (one string) was replaced with a structured
`branding.vertexFooter: { generatedLine, rightsLine }` — two plain pre-formatted strings, built by
`vertexFooter(now = new Date())` in `adapters/shared.ts`:

```
generatedLine:  Generated with Vertex Accounting Solutions
rightsLine:     © {year} Vertex Accounting Solutions. All rights reserved.
```

`{year}` is `now.getFullYear()` — computed at render, **never hardcoded** (an injectable clock,
`ctx.now`, keeps this deterministic in tests). `<DocumentFooter>` renders `generatedLine` in
`font-medium` next to a **restrained, print-safe monochrome "V" mark** — a 14px outline square
(`border border-neutral-400 text-neutral-500`), NOT the app's `bg-brand`-filled `<Wordmark>`
component (that filled ink block is theme-dependent and violates the white-paper / no-dark-block
rules). `rightsLine` sits smaller and muted below. One `<DocumentFooter>` per sheet — no
per-document footers. Company Settings has no field that can reach `vertexFooter`; there is no
white-labelling.

**Wordmark naming discrepancy.** The in-app `src/components/app/wordmark.tsx` renders **"Vertex
Accounting"** (two words, no "Solutions"). This footer deliberately uses the user-specified
**"Vertex Accounting Solutions"**. There is no legal-entity string anywhere in the app to
reconcile against. If a single canonical product name is wanted, the two need to be aligned — flagged,
not resolved here.

---

## Browser print metadata — what the app can and cannot control

The browser's own print output adds four pieces of **chrome** that are NOT part of the `.business-document`
sheet (our sheet renders none of them):

| Position | Source | App control |
|---|---|---|
| **Top-centre** title | `document.title` | **Yes, partially.** `printBusinessDocument(documentNumber?)` saves `document.title`, sets it to the document number (e.g. `SO-2026-0004`) before `window.print()`, and restores it on `afterprint` (+ a 2 s fallback). The modal passes `viewModel.documentNumber`. This replaces the app title ("Accounting Suite") in that header with a clean business string. |
| **Top-left** date / time | browser "Headers and footers" setting | **No.** No web API can set or suppress it. |
| **Bottom-left** page URL | browser "Headers and footers" setting | **No.** No web API. |
| **Bottom-right** page number (`1/1`) | browser "Headers and footers" setting | **No.** No web API. |

`@page { margin: 0 }` can make Chrome drop the chrome entirely, but then the sheet content bleeds to
the physical paper edge — not acceptable. **The only way to remove the date / URL / page number is
for the user to untick "Headers and footers" in the print dialog.** The preview modal says so, in
the toolbar above the sheet (never on the sheet):
`For a clean PDF, turn off "Headers and footers" in your browser's print dialog.`

## PDF export — native browser print stays (no library added)

`package.json` carries **zero** PDF/canvas libraries (no jsPDF, html2canvas, react-pdf, pdfmake,
paged.js, puppeteer). **Decision: keep native `window.print()` → "Save as PDF".** Rationale:

- **jsPDF + html2canvas** rasterises the page — kills selectable text, degrades the logo and small
  type, balloons file size.
- **react-pdf** needs a second, parallel layout engine — the entire A4 template would have to be
  rebuilt in its primitives and kept in sync.
- **paged.js / print-CSS polyfills** are heavy and *still* cannot remove the native browser chrome.

Native print + the "turn off Headers and footers" instruction is the correct trade for A4 fidelity,
selectable text, bundle size and maintenance. Nothing was installed.

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
    / `.business-document__parties` / `.business-document__lower` get `break-inside: avoid`.
  - `.business-document__parties-grid` is re-pinned to `grid-template-columns: 1fr 1fr !important`
    inside `@media print` so the issuer/recipient columns stay side by side on paper.
  - The **footer flows at the end of the content** — no `position: fixed`, no page numbers
    (avoids the fixed-element / overlap pitfalls).
  - The pre-existing app-wide `@media print` block in `src/styles/globals.css` (hides sidebar /
    topbar / toaster) still applies underneath as a safety net.
- **Browser header/footer:** see "Browser print metadata" above — the modal toolbar tells the user
  to turn off "Headers and footers"; `printBusinessDocument()` swaps `document.title` so the
  top-centre header shows the document number instead of the app title.

---

## Per-document support

All five put the issuer LEFT under a **`From`** heading and the recipient RIGHT.

| | Title | Recipient heading | Issuer income-tax no. | Secondary date | Payment block | Meta fields |
|---|---|---|---|---|---|---|
| **Quote** | `QUOTE` | Prepared for | no | Valid until (`expiryDate`) | – | *(none)* |
| **Sales Order** | `SALES ORDER` | Bill to | no | – (no field exists) | – | Quote reference |
| **Invoice** | `TAX INVOICE` / `INVOICE` (per `isVatRegistered`) | Bill to | yes | Due date | nominated active bank acct | Payment terms · Sales order reference |
| **Credit Note** | `CREDIT NOTE` (rose title + "Total credit") | Credit to | yes | – | – | Against invoice · Reason (+ detail when `other`) |
| **Purchase Order** | `PURCHASE ORDER` | Supplier | no (issuer is the buyer) | Expected delivery (`expectedDate`, if set) | – | *(none)* |

The customer/supplier account number now shows **only** in the recipient party block (`Account: …`),
never also in the meta strip.

- Line columns are always `description, quantity, unitPrice, vat, amount`; `code` is prepended and
  `unit` inserted after `quantity` **only** when at least one line resolves that value.
- Invoice totals: `Subtotal, VAT, Total`; plus `Amount paid` + `Balance due` (`total - amountPaid`)
  **only when `amountPaid > 0`**.
- Redundant header/meta: document number and dates live in the header block; the account number
  lives in the party block; the `meta` strip carries only the remaining references (terms, source
  docs, reason) and can be empty.

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
off, PDF export from the print dialog, dark-theme-app → white-paper, the two-column parties row and
the two-column invoice lower section on a real A4 page — has **not** been visually verified. A human
must open a Quote / Invoice / Credit Note / PO detail page on the deploy, click **Print / PDF**, and
check the sheet + a real print preview (with "Headers and footers" both on and off).
