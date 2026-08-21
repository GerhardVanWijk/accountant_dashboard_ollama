# Known Issues

Running log of real issues hit during hive development — not a bug tracker for the
product itself (no real users yet), but a record of things that were true problems
during the build, whether fixed, worked around, or still open. Newest first within
each section.

## Open

### Non-deductible input VAT isn't split out of the VAT Input control account when a bill posts
`billService.postBill()` debits `acc_2110` (VAT Input) for the ENTIRE `bill.taxTotal`,
without checking whether any of the bill's line items used a `non_deductible`-treatment
tax rate (e.g. `NODEDUCT`). Per SA_ACCOUNTING_MASTER_SPEC.md §12, non-deductible VAT
must never be claimed back — it should fold into the expense line instead, the same way
`src/features/banking/utils/taxCalculations.ts`'s `isTaxSeparatelyPosted()` already
correctly handles it for bank transaction allocations. `postBill()` doesn't have access
to a tax-rate lookup at all today, so fixing this means injecting `TaxRateService` (or
an equivalent minimal interface) the same way `journalEntryService` is injected, and
splitting the debit between Expense and VAT Input per line. Not exploitable with the
current seed data (no seed Bill has a non-deductible line), and the new
`vatReportService.ts`'s reconciliation would correctly flag the resulting variance if
one ever did — this is what a reconciliation is *for* — but it's a real gap, found
while building the VAT engine, not fixed in that pass.

### VAT reconciliation shows a variance against pre-existing seed documents (expected, not a bug)
`src/mock-data/journalEntries.ts` only seeds ONE journal entry (the opening balance) —
none of the seeded Invoices/Bills/Credit Notes were ever run through
`postInvoice()`/`postBill()`/`issueCreditNote()`, so no real GL postings exist for them
despite their `status` fields implying they're "sent"/"awaiting_payment"/etc. The new
VAT reconciliation (`vatReportService.ts`'s `reconcileVatControlAccounts`, surfaced on
`/tax/vat-return`) will therefore show "Variance detected" out of the box for any period
containing only seed data — this accurately reflects that those specific historical
documents bypassed the real posting pipeline, it is not a bug in the reconciliation
logic. Any NEW invoice/bill/credit note created and posted through the running app
reconciles correctly (verified by `vatReportService.test.ts`). Same underlying gap
applies to the AR/AP reconciliation added in the previous pass — not newly introduced
here, just newly visible via a second reconciliation.

### `ProductsPage.test.tsx`'s "low stock" test fails only when run after its sibling tests
Introduced 2026-08-21 while wiring `ProductsTable`/`ProductForm` to the new
`useTaxRates()`/`useAllTaxRates()` hooks (Tax module). The test passes in isolation
(confirmed by running it alone) but fails when run as part of the full file — looks
like leftover DOM/state from an earlier test in the same file rather than anything
about the tax-rate logic itself (added the standard `cancelled` guard to the new hooks,
matching `useDashboardData.ts`'s pattern, and it didn't fix it). Explicitly NOT
investigated further or patched in this pass per direct instruction — flagging so it
isn't lost, not because it's low-value to fix.

### GL posting engine has no storage-layer enforcement of the balance invariant
`JournalEntryService.postJournalEntry()` (`src/features/accounting/services/`)
validates sum(debit) === sum(credit) in application code before writing, but the mock
repository is an in-memory array with no `CHECK` constraint or transaction backing it.
Fine for a single-writer mock; a real backend must also enforce this at the storage
layer (DB constraint or serializable transaction), since application code alone can't
stop a second writer from bypassing the service. See `docs/LEDGER_ARCHITECTURE.md`.

### GL posting engine has no currency dimension yet
`JournalLine` (`src/types/journalEntry.ts`) has no currency/exchange-rate field, so
every seeded account and posting is implicitly single-currency even though
`CurrencyCode` exists as a shared primitive. Needs solving before multi-currency
invoices/bills can post to the GL. See `docs/LEDGER_ARCHITECTURE.md` § Known gaps.

### Aging-bucket key-name inconsistency between Customers and Suppliers
`src/features/customers/utils/calculateAging.ts` and
`src/features/suppliers/utils/calculateAging.ts` were built independently (parallel
Wave 1 dispatch) and produce differently-shaped bucket objects for the same concept:
- Customers: `{ current, days1to30, days31to60, days61Plus, total }`
- Suppliers: `{ current, days30, days60, days90Plus, total }`

Neither is wrong in isolation, and Dashboard Bee correctly normalized both into a
shared `FleetAgingBuckets` shape (`src/features/dashboard/types/aging.types.ts`)
rather than assuming they matched — so nothing is currently broken. But the
inconsistency itself is still there in the two source files and will confuse anyone
extending either module directly. Worth a small cleanup pass to converge on one
bucket-naming convention across both.

### Dashboard financials are fully mocked
Revenue/Expenses/Profit and the Cash Flow chart have no real General Ledger or Banking
data to draw from yet (`src/features/dashboard/mock-data/financials.ts`, commented
`TEMPORARY`). Will need rewiring once the Accounting/Banking modules exist.

### Two GitHub identities in play
`gh auth status` shows two authenticated accounts (`GerhardVanWijk` active,
`Gerhard29046` inactive); the local git commit email for this repo is
`gerhard.ark.of.war@gmail.com` (repo-local override, set 2026-08-20, not the global
git config). This is intentional per explicit user instruction, not a misconfiguration
— noted here only so a future session doesn't "fix" it back to the global default.

### CRLF/LF git warnings on every commit
Every commit prints a `LF will be replaced by CRLF` warning per changed file (Windows
checkout, no `.gitattributes` committed). Harmless, but noisy. A `.gitattributes`
pinning `* text=auto eol=lf` (or accepting CRLF explicitly) would silence it.

## Resolved

### Delete had no posted-record guard across 7 services (SA spec §14/§36/§72/§79)
`deleteInvoice`/`deleteBill`/`deleteCreditNote`/`deleteQuote`/`deleteSalesOrder`/
`deletePurchaseOrder`/`deleteCustomer`/`deleteSupplier` all called
`repository.delete(id)` unconditionally. Fixed 2026-08-21: each now guards on status —
`deleteInvoice`/`deleteBill`/`deleteCreditNote`/`deleteQuote` require `'draft'`,
`deleteSalesOrder` requires `'pending'` (no true draft state), `deletePurchaseOrder`
requires `'draft'`, and `deleteCustomer`/`deleteSupplier` check for linked open
Invoices/Bills (see next item) rather than a status, matching
`docs/DO_NOT_BREAK.md`'s existing pattern of never-hard-delete-with-history. 2 new tests
added (draft deletes succeed, posted deletes are rejected); 2 pre-existing tests that
deleted a seeded non-draft bill/PO were updated to use a draft fixture instead (a test
data problem, not a false failure — the guard's new behavior is correct).

### Customers/Suppliers aging (and their delete-guards) were still on temporary mock data
Flagged 2026-08-20 as blocked on Sales/Purchases not existing; Wave 1b (2026-08-21)
shipped both. Fixed 2026-08-21: added `invoicesToOpenItems()`/`billsToOpenBills()`
adapters converting real, non-draft/non-void Invoice/Bill records (aged on the
*outstanding* balance, `total - amountPaid`, not the original total) into the existing
`OpenItem`/`MockOpenBill` shapes the aging math already consumed — no signature changes
needed to `calculateAging`/`calculateFinancialSummary` themselves. Rewired: Customer/
Supplier Detail pages, the Dashboard's fleet-wide AR/AP aggregation
(`calculateArAgingForCustomers`/`calculateApAgingForSuppliers` now take real
invoices/bills as parameters), and `customerService.deleteCustomer()`/
`supplierService.deleteSupplier()`'s linked-history guards (previously Supplier's guard
checked mock data; Customer had no guard at all despite a doc comment claiming
customers are "NEVER hard-deleted"). One existing test asserted the guard against a
seeded supplier (`sup_00000001`) whose only real Bill is fully paid — updated to use
`sup_00000004`, which has a real unpaid bill, since the guard's *behavior* is unchanged,
only which fixture demonstrates it.

**Found along the way, also fixed**: `src/features/sales/hooks/useCustomerMap.ts`
constructed its own separate `CustomerService`/`MockCustomerRepository` instance instead
of importing the canonical singleton from `src/features/customers/services/
customerService.ts` — the same "two disconnected in-memory stores" bug already fixed
once this session for `InvoiceService` (see the Wave 1b commit). Now imports the shared
singleton.

### Tax invoices didn't render real company/VAT registration data (SA spec §13)
`InvoiceDetail.tsx`'s `companyName` prop defaulted to the literal string `'Your
Company'`, never wired to the real `Company` entity. Fixed 2026-08-21: added
`useCompany()` (`src/features/admin/hooks/`), and both `InvoiceDetail` and
`CreditNoteDetail` now accept a `company` prop rendering the real name, VAT
registration number, and CIPC registration number when available. `Company` has no
address field yet, so that's still not renderable — not fabricated, left absent.

### No AR/AP subledger reconciled to its GL control account (SA spec §17/§18/§70/§71)
Nothing compared sum(open invoices)/sum(open bills) against the GL's `acc_1100`/
`acc_2000` balance. Fixed 2026-08-21: added `reconcileAccountsReceivable()`/
`reconcileAccountsPayable()` (`src/features/accounting/services/
subledgerReconciliation.ts`), each comparing the control account's real posted GL
balance (via `journalEntryService.getAccountLedger()`) against the real subledger
total, with 5 tests covering an exact match, a fully-unposted invoice, a
partially-posted bill, and draft/void exclusion. Surfaced on the Trial Balance page as
a "Subledger Reconciliation" section (`SubledgerReconciliationCard`) — a variance is
shown, never silently corrected, matching §40's suspense-account principle.

### Purchase Order could be converted to a Bill more than once
`PurchaseOrder` had no `billId`/converted-status field, and `PurchaseOrderDetail`'s
`canConvert` guard didn't track that a conversion already happened. Fixed 2026-08-21:
added `PurchaseOrder.billId?: ID`, set once `PurchaseOrdersPage`'s "Convert to Bill"
action succeeds; `purchaseOrderService.convertToBill()` now rejects a PO that already
has one (enforced at the service layer, not just hidden in the UI).

### `ARCHITECTURE.md` claimed Phase 0 work was done when the repo was empty
At hive startup (2026-08-20), `docs/ARCHITECTURE.md`'s "Current Phase" section had
✅ checkmarks against Architecture/Design System/Routing/Auth/Mock repos, but the
filesystem had no `src/`, no `package.json` — nothing but docs and agent personas.
`docs/DEVELOPMENT_STATUS.md` and `docs/HIVE_TASKS.md` correctly showed everything
unchecked/🔴. Treated the task board as source of truth and corrected `ARCHITECTURE.md`
once real work landed. **Lesson**: docs can drift from reality even at hour zero;
audit the filesystem, don't trust doc checkmarks.

### npm audit: 7 vulnerabilities requiring breaking major-version upgrades
Post-Phase-0, `npm audit` found `esbuild`/`vite` (moderate, dev-server request
forgery) and `react-router` (moderate, open redirect + SSR deserialization issue),
both only fixable via `npm audit fix --force`: Vite 5→8, react-router-dom 6→7.18,
`vitest` 2→4 (transitive), `@vitejs/plugin-react` 4→6 (peer-dep bump needed
separately, `--force` alone left it mismatched). Fixed; `npm audit` now reports 0
vulnerabilities. **Follow-on breakage from the majors, also fixed**:
- `src/app/App.tsx` imported `type { Router as RemixRouter } from '@remix-run/router'`
  — that package no longer exists in React Router v7 (merged into `react-router`).
  Replaced with `ReturnType<typeof createBrowserRouter>`.
- `vite.config.ts` used `__dirname`, which Vite 8 deprecates in favor of
  `import.meta.dirname`.
- Architect Bee's dependency-upgrade report initially didn't mention the `vitest` 2→4
  bump (only react-router-dom/vite/plugin-react) — QA Bee's independent `git diff`
  review caught it. Not a functional problem (tests stayed green), but a reminder that
  self-reports need independent diff verification, not just command-output trust.

### `ROUTES.md` domain grouping doesn't match bee/feature-folder ownership
`docs/ROUTES.md` puts the Customer Directory under `/sales/customers` and the Vendor
Directory under `/purchases/vendors` (matching how real accounting software groups
AR/AP under Sales/Purchases menus), but `customers-bee`/`suppliers-bee` own
`src/features/customers/`/`src/features/suppliers/` per their persona files — not
`src/features/sales/`/`src/features/purchases/`. Resolved by scoping each bee to its
own feature folder plus exactly one named "exception file"
(`src/features/sales/pages/CustomersPage.tsx`,
`src/features/purchases/pages/VendorsPage.tsx`) that assembles their components —
avoids both bees touching `router.tsx`/`navigation.ts` and avoids folder-ownership
confusion. Documented in `docs/ARCHITECTURE.md` so it doesn't get "fixed" into a
folder move later without realizing it's intentional.

### Repository-location convention inconsistency (Customer vs. everyone else)
`MockCustomerRepository` lives at top-level `src/repositories/mock/` because it was
Phase 0's reference-pattern proof (ADR 001) — but its own doc comment directs every
OTHER feature to put repositories feature-local at `src/features/[feature]/repositories/`.
Not a bug, but easy to copy the wrong precedent if a bee reads the file location
instead of the doc comment. Now called out explicitly in every subsequent bee's
dispatch brief and in `docs/ARCHITECTURE.md`.

### Icon-registry gaps discovered iteratively, not upfront
The Icon System was designed before any feature UI existed, so the initial registry
(33 keys) covered nav/chrome/domain concepts but missed common row/table-action icons.
Customers Bee and Suppliers Bee (parallel Wave 1) both independently hit missing
`edit`/`add`/`delete`/`filter`/`download`/`view`/`sort`/`calendar`/`phone` and correctly
worked around it with text-label fallbacks rather than importing `lucide-react` directly
or editing the frozen registry mid-parallel-run. Fixed in a dedicated follow-up UI Bee
pass once Wave 1 landed. Dashboard Bee (Wave 2, solo dispatch, no parallel-write risk)
later added `trendUp`/`trendDown` directly. **Lesson**: expect at least one follow-up
icon-registry pass per wave; budget for it rather than treating it as a surprise.

### Parallel-dispatch file-conflict risk (process fix, not a code bug)
Running multiple bees concurrently against the same working directory (no git
worktrees) risks silent last-write-wins collisions on any shared file two bees both
touch (`router.tsx`, `navigation.ts`, `icons.ts` were the real risks). Mitigated by:
scoping each parallel bee to disjoint folders, freezing shared config files during
multi-bee waves (only a single sequential bee — or a solo-dispatch wave — may touch
them), and deferring cross-module wiring to genuinely sequential passes. Held for
all of Phase 1 Wave 1 without incident.

### ADR 002 (sequential-only worker execution) — obsoleted
Originally: workers dispatched strictly sequentially, because the hive was assumed to
run on a local Ollama Qwen3:8b instance with limited VRAM. User confirmed (2026-08-20)
that constraint no longer applies. Superseded in `docs/DECISIONS.md`: parallel dispatch
is fine when bee scopes don't overlap and there's no dependency ordering; still
sequence bees that share files or have producer/consumer dependencies (e.g. Dashboard
Bee needed Wave 1's services to exist first).
