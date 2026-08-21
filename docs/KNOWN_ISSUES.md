# Known Issues

Running log of real issues hit during hive development — not a bug tracker for the
product itself (no real users yet), but a record of things that were true problems
during the build, whether fixed, worked around, or still open. Newest first within
each section.

## Open

### Delete has no posted-record guard across 7 services (SA spec §14/§36/§72/§79)
`deleteInvoice`/`deleteBill`/`deleteCreditNote`/`deleteQuote`/`deleteSalesOrder`/
`deletePurchaseOrder`/`deleteCustomer` all call `repository.delete(id)` unconditionally —
no status check stops deleting a posted invoice, an issued credit note, or a confirmed
sales order, violating the master spec's immutability rules. Not currently exploitable
(no UI wires any of these `delete*` methods to a button), so it's a dormant service-layer
gap, not an active bug. Needs a consistent policy across all 7 services (delete only
while `status === 'draft'`; everything else goes through void/cancel/reversal) rather
than 7 one-off patches. Full detail in `docs/SA_SPEC_GAP_ANALYSIS.md`.

### Tax invoices don't render real company/VAT registration data (SA spec §13)
`InvoiceDetail.tsx`'s `companyName` prop defaults to the literal string `'Your Company'`
and is never wired to the real `Company` entity (`src/features/admin/`), which already
stores legal name, VAT registration number, and address. No supplier VAT number appears
on any rendered invoice/bill. `Company` data exists; it's just not plumbed through to
document rendering yet.

### No AR/AP subledger reconciles to its GL control account (SA spec §17/§18/§70/§71)
Nothing compares sum(customer balances) or sum(supplier balances) against the GL's
`acc_1100`/`acc_2000` balance. Banking has its own reconciliation module (bank statement
vs. cashbook); Sales/Purchases have no equivalent. A posting bug in either would
currently go undetected until it showed up elsewhere.

### Customers/Suppliers aging still not wired to real Invoice/Bill records
Flagged 2026-08-20 as blocked on Sales/Purchases not existing yet. Wave 1b (2026-08-21)
shipped both, so this is now genuinely actionable — `src/features/customers/mock-data/
openItems.ts` and `src/features/suppliers/utils/calculateAging.ts`'s `mockOpenBills`
just haven't been re-pointed at real `Invoice`/`Bill` data yet.

### Purchase Order can be converted to a Bill more than once
`PurchaseOrder` has no `billId`/converted-status field, and `PurchaseOrderDetail`'s
`canConvert` guard only checks `status !== 'draft' && status !== 'cancelled'` — it
doesn't track that a conversion already happened. `PurchaseOrdersPage`'s "Convert to
Bill" action (Wave 1b) composes `billService.createBill()` + `billService.postBill()`
so the resulting Bill is always genuinely posted to the GL, but nothing stops clicking
Convert twice and creating two Bills from the same PO. Needs a real field, not a UI
workaround, when picked up.

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
