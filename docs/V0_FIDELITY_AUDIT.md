# v0 Design Fidelity Audit & Phase 1 Correction

Session record of the Queen Bee-led audit comparing the current Vertex
Accounting UI (`src/`) against the recovered original v0.app reference
export (`accounting-software-platform/`), and the first corrective phase
implemented from its findings. Written after the fact from the session
transcript, for anyone picking this up later — not generated live
during the work.

## Timeline

1. **Impeccable installed** — `npx impeccable install` (v3.6.0), project-scoped
   under `.claude/skills/impeccable/`, to support future design-quality work.
2. **Initial `/impeccable audit`** (code-only, no browser) — ran the bundled
   58-rule static detector against `src/` (0 findings — the ruleset targets
   generic marketing/AI-slop visual anti-patterns, not this app's own
   conventions) and a manual review against `docs/DO_NOT_BREAK.md`. Real
   finding: the icon-registry rule ("no feature file imports `lucide-react`
   directly — only `src/config/icons.ts`/`Icon.tsx` may") is violated in
   ~110 files, a side effect of the v0 design-system port (M0–M9) that was
   never reflected back into the doc. Not acted on this pass — flagged for
   a future session.
3. **First v0-comparison attempt** — asked to diff the current UI against
   `accounting-v0-frontend/`, the directory ~97 in-repo doc-comments
   (`/** Ported from accounting-v0-frontend/... */`) cite as their source.
   That directory does not exist anywhere in this repo, its git history
   (either branch), or the broader filesystem — it was a temporary local
   checkout during the original M0–M14 port, never committed. Comparison
   was reconstructed instead from those ~97 self-documented doc-comments
   (unusually detailed — most state exactly what changed and why), which
   is real evidence but not a literal diff.
4. **v0 source recovered** — the user added a genuine raw v0.app export at
   `accounting-software-platform/` (Next.js project: `app/`, `components/`,
   `lib/app/mock/`). Two full audit passes then read it directly:
   - **Pass 1**: App Shell (sidebar/topbar/layout), Dashboard, Companies,
     Chart of Accounts, Bank Reconciliation, Customers/Suppliers/Invoices/
     Bank Accounts (stat-row spot check), Marketing homepage, Login.
   - **Pass 2 (completion)**: General Ledger, Journal Entries, Trial
     Balance, Financial Periods, Invoices (full), Credit Notes, Customer
     Receipts/Supplier Payments, Bank Transactions, Forgot/Reset Password.
5. **Phase 1 implemented** — restored the v0 stat-summary `SectionCard`/
   `FigureBlock` row on the Customers and Suppliers list pages, the
   lowest-risk, highest-consistency item from the migration plan.

## Headline finding

The M0–M14 v0 port used three different approaches depending on the area,
not one uniform method:

- **Genuine near-verbatim ports** (95–99% structural fidelity): the App
  Shell (sidebar/topbar/layout wrapper), the Dashboard's presentational
  components, the Marketing homepage, and most Auth screens. Confirmed by
  direct line-by-line comparison, not just doc-comments.
- **Legacy Vertex screens with v0 styling only** (35–65% fidelity): most
  transactional/business pages (Customers, Suppliers, Chart of Accounts,
  Sales, Purchases, Banking) — v0's actual JSX/primitives were adopted,
  but the pre-existing Vertex page composition, business logic, and (for
  several pages) an entire structural tier — v0's stat-summary row — were
  not carried over uniformly.
- **No v0 source exists at all** for several SA-compliance modules (Tax,
  Fixed Assets, Payroll, Compliance, Leases, Related Parties, Foreign
  Exchange) — confirmed once the real v0 export was recovered: it does
  have `assets`/`expenses`/`inventory`/`compliance`/`tax`/`vat` stub pages,
  narrower in scope than Vertex's real build-out, and no sign-up screen at
  all (Vertex's `SignUpPage` is original work, not a port of anything).

## Final fidelity scores (selected)

| Screen | Fidelity | Class |
|---|---|---|
| Sidebar / Topbar / App Shell layout | 97–99% | Direct port |
| Dashboard | 90% | Adapted port |
| Marketing Homepage | 95% | Direct port |
| Trial Balance / Financial Periods | 88–92% | Adapted port |
| Invoices / Credit Notes | 88–90% | Adapted port |
| Companies | 75% | Adapted port (deliberate) |
| Customers / Suppliers (pre-Phase 1) | 60% | Partial port |
| Chart of Accounts | 35% | Legacy structure, v0 styling only |
| Bank Accounts + Transactions (split from v0's one page) | 65% | Partial port, split |
| Customer Receipts / Supplier Payments (split from v0's one page) | 65% | Partial port, split |
| Bank Reconciliation | 50% | Recreated approximation (deliberate — real backend has no "in-progress" state v0's mock assumes) |

Full per-screen detail, exact v0-file→Vertex-file mappings, and the
A/visual-fixable vs. B/backend-required vs. C/missing-in-v0 classification
are in the session transcript, not reproduced in full here.

## Migration plan (proposed, only Phase 1 executed so far)

**Tier 1 (LOW risk, highest cross-screen consistency value):**
1. Restore the stat-summary row on Customers and Suppliers — ✅ **done, this phase**.
2. Restore the missing Export toolbar button on Invoices/Credit Notes — not done, deferred (needs confirmation real export functionality exists first, per explicit instruction).

**Tier 2 (MEDIUM/HIGH risk — real information-architecture decisions):**
3. Chart of Accounts — decide: adopt v0's actual `DataTable` (flat, indent-styled) or keep the bespoke hierarchical table but restore the missing Balance/Category columns and summary card.
4. Bank Accounts + Bank Transactions — consider merging into one page matching v0's unified "Banking" hub, or keep the split with the account-card grid added to one of the two pages.
5. Customer Receipts / Supplier Payments — keep the two-page split (real backend requirement: `CustomerReceiptService`/`PaymentService` are genuinely separate), but consider a small additive "net cash movement" summary to recover the one useful figure v0's unified page showed.

**Tier 3 (deliberately deprioritized per explicit instruction):**
6–10. Dashboard's two placeholder panels, GL's dropped Source filter, Reset Password's rule-count copy, Login's missing "Remember me" checkbox, Topbar breadcrumb root path.

## Phase 1 — what was implemented

**Files changed:**
- `src/features/customers/pages/CustomerListPage.tsx`
- `src/features/suppliers/pages/SupplierListPage.tsx`

**v0 source used:**
- `accounting-software-platform/app/app/customers/page.tsx`
- `accounting-software-platform/app/app/suppliers/page.tsx`

**Customers — added stat row** (`SectionCard` + `grid gap-6 sm:grid-cols-2
xl:grid-cols-4` of `FigureBlock`s, matching v0's layout/labels/tones
exactly):
- **Total receivable** — `sum(customer.balance)` (real AR balance field).
- **Overdue** — `calculateAgingForCustomer()` + `getOverdueTotal()` (existing
  customers-feature utils) against real posted Invoices via `useInvoices()`
  + `invoicesToOpenItems()` — the same pattern `CustomerDetailPage.tsx`
  already used.
- **Active accounts** — `count(status === 'active')`.
- **On hold** — `count(creditHold === true)`. v0's mock has a distinct
  `'on-hold'` status value the real `ActiveStatus` enum doesn't have; the
  real `creditHold` boolean (already surfaced elsewhere via
  `CreditHoldBadge`) is the honest equivalent, not a fabricated status.

**Suppliers — added stat row** (same structure):
- **Total payable** — `sum(supplier.balance)`.
- **Overdue** — `calculateAging()` + `billsToOpenBills()` (existing
  suppliers-feature utils) against real posted Bills via `useBills()` —
  the same pattern `SupplierDetailPage.tsx` already used. Substitutes for
  v0's "Due for release," which relies on a mock approval-status field the
  real `Supplier` type has no equivalent of.
- **Active accounts** — `count(status === 'active')`.
- **On hold** — `count(onHold === true)`. Substitutes for v0's "Average
  terms" (a numeric days figure), which could **not** be reproduced
  truthfully: the real `Supplier.paymentTerms` is a closed label enum
  (`'Net14' | 'Net30' | 'EOM'`) and `'EOM'` has no fixed day count to
  average — averaging it would have meant fabricating a number.

Both substitutions are documented inline in each file's doc comment, not
silently made.

**Verification (this phase):**
- `npx tsc --noEmit` — clean.
- `npx vitest run` — 939 passed, 1 failed. The one failure
  (`MockCustomerRepository.test.ts`) is a pre-existing network/environment
  issue (`SupabaseInvoiceRepository.getAll()` attempting a real network
  call, unreachable in this sandbox) unrelated to either changed file —
  confirmed in isolation, before this phase. Customers/Suppliers feature
  tests: 43/43 passed. The previously-documented `MockSupplierRepository`
  failure (`docs/KNOWN_ISSUES.md`) did not reproduce this session.
- `npx eslint src --max-warnings 0` — clean. `npm run lint` (unscoped)
  shows 39 pre-existing warnings, all inside `accounting-software-platform/`
  (that directory has no ESLint ignore entry yet) — unrelated to this
  phase, that directory was never modified.
- `npm run build` — clean.

## Not yet committed at time of writing

- `.claude/skills/impeccable/` (the installed skill) and
  `accounting-software-platform/` (the recovered v0 reference export)
  remain untracked in git as of this doc's creation — neither was
  explicitly requested to be committed, both are local tooling/reference
  material rather than application code. Flagged here in case a future
  session needs to know why they don't appear in the commit that
  introduces this file.
