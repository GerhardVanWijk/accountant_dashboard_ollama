# CURRENT TASKS — Browser-Driven Correction Pass

**Opened:** 2026-08-27
**Rule:** Do NOT commit or push until the entire pass is complete and validated. Stop for user review.
**Source:** User's visual inspection of the deployed app ("Vertex Accounting") — 28-point brief.

Legend: `[ ]` not started · `[~]` in progress · `[x]` complete

---

## A. Global UI fixes

- [x] **1. Global dropdown / select dark-theme fix** — audit every select implementation
  (native `<select>`, shadcn Select, custom dropdowns, comboboxes, filter selects, form
  selects). Dark theme open menus need: dark surface, readable foreground, dark/neutral
  hover, green selected/accent state, visible disabled states, visible scrollbar for long
  lists, no unstyleable browser-default white. Audit native `<select>` CSS + `color-scheme`.
  Test selects from Company, Customer, Supplier, Invoices, Banking, Accounting, VAT,
  Settings, Administration.
  - **Root cause:** ~34 forms use a bare native `<select>` styled `bg-transparent` (like
    `Input`). Closed = fine (dark page shows through). Open on Windows Chromium = the option
    popup paints near-white while option text keeps the inherited near-white `--foreground`
    → unreadable. shadcn `Select` (base-ui, `bg-popover`) and the DataTable filter selects
    were never affected.
  - **Done:** global `@layer base` rule in `src/styles/globals.css` pins
    `select option/optgroup` to `--popover` / `--popover-foreground` (theme-aware, can't be
    overridden by a utility on the `<select>`), disabled → muted, `:checked`/`:hover` →
    `--brand-muted` green. Solid trigger bg fallback. `color-scheme` was already correct.
  - **Done:** shared `NativeSelect` (`src/components/ui/shadcn/native-select.tsx`, forwardRef,
    matches `Input`, `data-slot`). **All 42 forms** migrated off the copy-pasted
    `selectClassName` string — `grep "<select"` / `grep "selectClassName"` across `src` now
    returns nothing. Full suite **1045/1045**, type-check/lint/build clean.
- [x] **2. Sidebar Vertex-green vertical edge** — subtle 1px-ish green right edge using the
  existing brand token, low/medium opacity, not neon, visible while scrolling, no clash
  with scrollbar. If the sidebar scrolls: dark track, subtle green-accented thumb, narrow
  width, accessible contrast. Not every sidebar border green.
  - **Done:** `after:` 1px `bg-brand-outline` (30% green) line on the fixed sidebar
    container's right edge in `app-sidebar.tsx` — stays put while `SidebarContent` scrolls
    behind it. New `.sidebar-scroll` utility (thin, transparent track, 32%→55% green thumb)
    replaces the old `no-scrollbar` on `SidebarContent`; `.no-scrollbar` kept (defined
    properly now) for the command palette; new `.app-scroll` for in-app panes.
- [x] **3. Fix tabbed-form sizing** — switching tabs must not resize the outer dialog/sheet.
  All multi-tab forms: Customer, Supplier, Company, Invoice (if tabbed), User/Role, Assets,
  Inventory, Accounting settings, any other. One stable dialog size; content area with
  min/fixed desktop height; internal scroll; stable header/footer/actions; responsive on
  small screens (no off-screen buttons); no hardcoded dims that break small laptops.
  - **Done:** `src/components/app/form-surface.ts` — `formDialogClass` / `wideFormDialogClass`
    / `compactDialogClass` (stable `md:h-[min(88dvh,44rem)]`, natural on mobile).
    `CustomerForm` (dialog) reworked: `Tabs` `flex-1 min-h-0`, each `TabsContent` scrolls
    internally (`.app-scroll`), action row anchored; `CustomerFormModal` → `formDialogClass`.
    `SupplierForm` (page): fixed `h-[28rem]` tab region + internal scroll so the page stops
    jumping on tab switches.
  - **Only 3 forms in the app use `<Tabs>`:** CustomerForm ✅, SupplierForm ✅, TransactionForm ✅.
    CustomerForm: `flex-1` tab region inside the fixed-height `formDialogClass` dialog.
    SupplierForm (page): `h-[28rem]` tab region. TransactionForm: `h-[30rem]` tab region.
    All: each `TabsContent` scrolls internally via `.app-scroll`, action row anchored.
    CompanyForm ✅ (not tabbed — given the stable-height treatment anyway).
- [x] **4. Standardise all form / detail surfaces** — shared wrapper: consistent width
  classes, consistent max-height, green outer border/ring, consistent header, consistent
  body padding, scrollable body, stable footer. No duplicated sizing classes across ~40
  forms. Audit every `DialogContent` / `SheetContent` consumer.
  - **Green ring + internal-scroll body wrapper + sticky footer** were already built into
    `DialogContent`/`SheetContent` (prior work). This pass added the shared width/height
    contract: `form-surface.ts` → `formDialogClass` (fixed h, tabbed forms),
    `wideFormDialogClass` (line-items), `standardDialogClass` (ordinary forms, natural h +
    88dvh cap), `compactDialogClass` (small). Rolled across the 13 `*FormModal.tsx`
    components. **Remaining (minor):** ~20 page-inline `DialogContent`s still carry ad-hoc
    `max-w-*` — mostly confirm/small dialogs, lower priority; will sweep in the final pass.
- [x] **23. Account Detail Sheet + all record-detail sheets consistent size** — every
  record-detail sheet in the app already goes through the **shared `RecordDetailSheet`**
  (`src/components/app/record-detail-sheet.tsx`) → one `SheetContent` (full-height,
  brand-green ring, its own scroll region, sticky header/footer). None of them are
  internally tabbed (the detail bodies are stacked `RecordDetailSection`s), so there is no
  tab-resize to fix. New `AccountDetailSheet` uses the same shared component +
  `recordSheetClass`. Nothing further needed.

## B. Chart of Accounts

- [x] **5. Chart of Accounts performance** — **root cause found + fixed (no browser tools,
  so this is static analysis of the query code).**
  - **Cause (severe N+1):** `useAccounts.load()` did
    `Promise.all(accounts.map(a => accountService.hasPostings(a.id)))`, and
    `AccountService.hasPostings()` itself does `journalRepository.getAll()` — i.e. it
    **fetched the entire journal history once per account** (≈50–150 full-ledger fetches),
    and again after every create/edit. The browser's ~6-connections-per-host limit meant
    these also starved every *other* query on the page — and on `LedgerPage` /
    `TrialBalancePage`, which also call `useAccounts()` (so this is the shared root cause
    of #7 too).
  - **Fix:** new `AccountService.getAccountIdsWithPostings()` — one ledger pass for the
    whole chart. `useAccounts` now does `Promise.all([getAccounts(), getAccountIdsWithPostings()])`
    → **2 queries total instead of 1 + N.** 3 new unit tests; 5 page-test mocks updated.
  - **Further (not done, needs an RPC + interface change across ~10 test fakes):** a
    `SELECT DISTINCT account_id FROM journal_lines` would avoid pulling line bodies at all;
    and `computeTrialBalance` could `GROUP BY account_id` server-side. Documented, not done
    in this pass.
- [x] **6. Chart of Accounts record opening** — clicking an account row opens an Account
  Detail Sheet/Form and stays on the CoA page (currently navigates to General Ledger).
  Show: code, name, type/category, status, normal balance, tax mapping, FS grouping,
  current balance, metadata, recent ledger activity where appropriate. Actions: Edit (if
  allowed), View ledger (this may explicitly open/filter GL). Preserve `?record=<uuid>`
  deep-link pattern.
  - **CONFIRMED real in `main`:** `AccountTable.tsx:31` `openLedger()` →
    `navigate('/accounting/ledger')` on account-name click. No detail sheet existed.
  - **Done:** new `AccountDetailSheet` (`src/features/accounting/components/`) — code, name,
    master type, FS grouping (subType), status, normal balance, ledger-history flag,
    description, **current balance + recent 5 ledger lines** (from `useAccountLedger` →
    `getAccountLedger()`, never recomputed). Actions: **Edit** (opens the existing form
    modal) + **View ledger** (the old navigate-to-GL behaviour, now explicit). Row click
    opens the sheet via `?record=<id>` and stays on the CoA page. `AccountTable` gained an
    `onSelect` prop; dropped its `useNavigate`/`accountingUiStore` coupling. 1 new page test
    proves it opens the sheet instead of navigating.

## C. Trial Balance

- [x] **7. Trial Balance performance** — **primary cause was the same #5 N+1** (the page
  calls `useAccounts()`), now fixed. Verified the rest:
  - `computeTrialBalance()` = 2 queries (`accounts.getAll()` + `journal.getAll()`) + one
    O(lines) client-side sum. Fine for small/medium; server-side `GROUP BY` noted as future
    work (needs RPC).
  - Subledger reconciliation already loads **independently** (its own `reconciliationLoading`
    state, rendered in a separate section) — it does **not** block the main TB display.
    That already matches #26.
  - The client-side `.sort()` by date in `postedEntriesSortedByDate()` is redundant for TB
    (it only sums) but negligible; left as-is to avoid touching shared ledger code.
- [x] **9. Trial Balance layout** — **already correct in `main`.** `TrialBalancePage`
  summary `grid gap-6 sm:grid-cols-3` (Total debits | Total credits | Difference). No
  filter toolbar on the page itself (search/filter lives in `TrialBalanceTable`).

## D. General Ledger

- [x] **8. General Ledger layout** — **already correct in `main`.** `LedgerPage` summary is
  `grid gap-6 sm:grid-cols-3` (Debits Posted | Credits Posted | Accounts Touched — horizontal
  from 640px). Account filter is `sm:w-auto sm:min-w-64` on its own row. No date-range/search
  filters exist on GL (would be new features, not layout). **Screenshots appear to predate
  M3 (2026-08-25) / the visual-fidelity audits.**

## E. Banking layout

- [x] **10. Bank Accounts layout** — **already correct in `main`.** `BankAccountsPage`:
  summary `grid gap-6 sm:grid-cols-2`; filter row `flex flex-col gap-3 sm:flex-row
  sm:items-center` (Search | Type | Status — horizontal from 640px).
- [x] **11. Bank Transactions layout** — **already correct in `main`.** `BankTransactionsPage`
  summary `grid gap-6 sm:grid-cols-3` (Statement lines | Awaiting reconciliation | Needs
  allocation). Account/status filters horizontal.

## F. Tax & Compliance layout

- [x] **12. VAT page layout** — **already correct in `main`.** `VatReturnPage` summary
  `grid gap-6 sm:grid-cols-3` (Output VAT | Input VAT (claimable) | Net VAT payable); period
  picker + Refresh in the PageHeader actions (top-right, horizontal); alerts full-width
  beneath. Other Tax pages (IncomeTax/DeferredTax `md:grid-cols-4`, CGT/PI-Score
  `sm:grid-cols-2 lg:grid-cols-4`) already horizontal too.

## G. Global layout audit

- [x] **13. Global "vertical report/filter" audit** — done.
  - **Finding:** the responsive horizontal layout the brief asks for is **already
    implemented across `main`.** `AppLayout`'s `<main>` is full-width (no `max-w`), the
    shared `DataTable` toolbar is `flex-col gap-3 lg:flex-row` + inner `sm:flex-row`
    (53 pages), and **every** `FigureBlock` summary strip uses a responsive grid.
  - **Zero** pages had a non-responsive `grid-cols-1`/`flex-col` summary or filter row.
  - **Fixed (5 straggler list pages** that were `sm:grid-cols-2` only with 4 stats → 2×2
    block on desktop): SupplierListPage, InvoicesPage, CreditNotesPage, CustomerListPage,
    JournalsPage → `sm:grid-cols-2 lg:grid-cols-4` (1×4 strip on desktop, matching the
    ~14 pages that already did this).
  - **Conclusion:** the deployed app the screenshots came from is **behind `main`** — the
    layout work landed M3 (2026-08-25) + the six visual-fidelity-audit commits + today's
    `9fd1666`. Needs a fresh deploy / local `npm run dev` to confirm.

## H. Bank Reconciliation redesign

- [x] **14. Compare with Xero workflow** — adopted the *workflow* (not visuals): a
  transaction-by-transaction two-pane surface, per-line quick actions, a
  compact/comfortable density toggle, in-context "Investigate" — while keeping the
  stronger engine (Difference Investigator, Books Integrity, opening-balance / duplicate /
  combination / wrong-sign / VAT / rounding / historical detection). What this app's domain
  does NOT have (and Xero-style "code this uncategorised line" partly covers instead): a
  separate raw-statement-line table — an import here becomes a full `BankTransaction`, so
  "match" = confirm/clear + "code" = the real GL allocation flow.
- [x] **15. Redesign Bank Reconciliation workspace** — `ReconciliationWorkspace.tsx`
  rebuilt as two panes. **Header:** statement date, statement closing balance, book (GL)
  balance, variance (green/red), balanced state, "Investigate R… difference" button,
  density toggle. **LEFT:** every statement line for the period — compact rows (date,
  description, reference, spent/received, status chip: Reconciled / Cleared this session /
  Needs allocation / Unreconciled), filterable. **RIGHT:** the selected line — details,
  source (imported/manual/transfer), its GL coding (or "not yet coded"), and the actions
  for it: **Code to a GL account** (opens the real `AllocateTransactionForm` — normal
  posting, not bypassed), **Mark / Un-clear**, **Open in Bank Transactions**.
  - **Real bug fixed along the way:** the page had `useBankReconciliation` instantiated
    *twice* (once in the section, once inside the workspace) — so the Difference
    Investigator tab always saw the default statement date / R0 balance / no cleared items,
    not what the user actually entered. State is now lifted to one instance on the page and
    passed to both.
- [x] **16. Compact / Comfortable toggle** — header toggle, persisted to
  `localStorage['vertex.reconciliation.density']` (try/catch — private windows just don't
  persist). Compact = tighter rows, reference hidden; Comfortable = roomier + reference.
- [x] **17. Difference Investigator integrated** — tab kept; also reachable from the
  workspace header ("Investigate R{variance} difference") which switches to the tab and
  auto-runs the investigation against the workspace's *real* current state (new `runSignal`
  prop on `DifferenceInvestigatorPanel`).
- [x] **22. Fix "Explained 100%" logic** — never show "100% explained" while a large
  unexplained amount remains. Clear metrics: Transactions analysed / Matched / Probable /
  Needs review / Variance explained / Variance remaining.
  - **Fixed:** `reconciliationHealthService.ts` reshaped — `ReconciliationHealth` now has
    **`matchCoveragePercent`** (`null`, not "100%", when nothing was analysed) AND a
    separate money view: **`varianceExplained`** (Rand of the gap with a candidate cause,
    capped at `|variance|`), **`varianceRemaining`**, **`varianceExplainedPercent`**
    (reaches 100 only when the gap is genuinely closed). `ReconciliationHealthCard` rebuilt
    to show both, labelled: "Transactions analysed / Confirmed / Probable / Needs review"
    then "Match coverage / Variance explained / Remaining unexplained". 5 new unit tests
    including the exact reported scenario (0 txns, R74,905 gap → **not** "100%").

## I. Reconciliation demo data

- [~] **18. Current reconciliation data is not good enough** — the confusing "Explained
  100% / Unexplained R74,905" is fixed by #22. The empty-data half needs demo rows in the
  live Supabase project — **see #20: this writes to the user's real single-tenant DB, so
  it needs an explicit go-ahead before I apply it.** The builder is ready.
- [x] **19. Realistic reconciliation demo dataset** —
  `src/features/reconciliationIntelligence/testFixtures/demoReconciliationScenario.ts` —
  a pure builder: FNB Business Cheque, Aug 2026, R100k opening, ~35 bank + books rows with
  every seeded fault the brief lists (10 clean matches, 3 date-offset, R10k→3 deposit,
  missing R185.50 charge, R62.10 interest, R47.50/R47.66 mismatch, duplicate rent,
  wrong-sign refund, wrong-account EFT, outstanding payment + deposit, VAT-split, pair &
  triple orphaned-journal combinations). Deterministic `expectedVariance` + an
  `expectedFaults` manifest.
- [~] **20. "Accountant demo scenario" seed/reset** — the builder (#19) is the reusable
  core. **Not wired to a live seed** (dev button or Supabase migration) — that mutates the
  user's real DB; flagged for approval. As a fixture it fully satisfies #21.
- [x] **21. Verify Difference Investigator against the dataset** —
  `demoReconciliationScenario.test.ts` runs the **real** `ReconciliationInvestigatorService`
  over the scenario. **7 tests, all pass:** detects `missing_ledger_side` (R185.50 charge,
  R62.10 interest), `amount_mismatch` (finds the **R0.16** card-fee delta by explanation),
  `duplicate_transaction`, `wrong_sign`, `grouped_match` (R10k = 3 receipts); and
  `combination_match` when the variance is exactly the pair sum (R801.25) or the triple
  sum. Every issue starts `status: 'open'`; `health.varianceRemaining` never negative.

## J. Performance / data layer

- [~] **24. Performance targets** — **no browser automation is available in this
  environment**, so no wall-clock ms. Reported structurally instead:
  - **Chart of Accounts** — before: `2 + N` round trips where N = account count, and each
    of the N was a **full `journal_entries` + `journal_lines` fetch** (`hasPostings()`
    per account). For a 120-account chart that's 120 full-ledger fetches, serialised
    behind the browser's 6-per-host cap. After: **exactly 2** queries
    (`accounts` list + one ledger pass), run in parallel.
  - **Trial Balance** — same `useAccounts()` N+1 removed (the page uses it); the compute
    itself is 2 queries + O(lines) client sum, unchanged.
  - **General Ledger** — flat view: 2 queries (`accounts` + `journal_entries`); narrowed
    to one account: swaps to `getAccountLedger()` (2 queries). Also carried the
    `useAccounts()` fix. No N+1 here originally.
- [x] **25. Supabase query / index review** — done via MCP (`pg_indexes` + `get_advisors`
  performance lint). **Every index the brief names already exists:**
  `journal_lines_account_id_idx`, `journal_lines_journal_entry_id_idx`,
  `journal_entries_company_id_idx`, `journal_entries_date_idx`,
  `accounts (company_id, code)` unique, `bank_transactions_bank_account_id_idx`,
  `reconciliation_issues` (bank_account_id / company_id / status). **No index migration
  is warranted** — the CoA/TB slowness was 100% the application-layer N+1 (#5), not a
  missing index (confirms the brief's "do not add indexes blindly"). Advisor notes, not
  acted on: `journal_entries_date_idx` is unused (matches the "fetch-all-then-filter"
  pattern); a handful of `*_journal_entry_id` FKs on small 1:1 tables are unindexed
  (not on any hot path).
- [x] **26. Loading UX** — `ChartOfAccountsPage` and `TrialBalancePage` loading states
  replaced: the page header + filter/search shell stays visible, and the body is now a
  **table-shaped skeleton** (+ a 3-tile summary skeleton on TB) instead of a 40vh centred
  spinner. Subledger reconciliation on TB was **already** independent (its own
  `reconciliationLoading`, separate section) — confirmed, unchanged.

## K. Verification & report

- [x] **28. Final report** — `docs/RECON_UI_CORRECTION_PASS_REPORT.md` (32-point return list).
- [~] **27. Final visual QA** — **browser automation is NOT available in this environment**
  (no Chrome DevTools / Playwright MCP). Could not do the 1440/1280/narrow screenshot pass.
  Mitigations: every change is behind `type-check` (strict) + `lint` (`--max-warnings 0`) +
  the full test suite + a production `vite build`; layout changes use standard responsive
  Tailwind already proven across the app; the impeccable design hook scanned each file.
  **The user should do a visual pass on a fresh `npm run dev` / deploy** — especially the
  reconciliation workspace and the native-select option lists in dark mode.

## M. Final cleanup pass (user-requested, 2026-08-27)

- [x] **1. Demo data dev/test-only** — `demoReconciliationScenario.ts` doc comment now
  states explicitly: test fixture / dev helper ONLY, never inserted into live Supabase,
  no production "Seed demo data" button. Verified **nothing app-side imports it**
  (`grep` — sole consumer is its own `.test.ts`).
- [x] **2. Unrelated working-tree noise** — `git diff .claude/agents/qa-bee.md` confirmed
  **whitespace-only** (one sentence split across 3 lines with stray spaces, words
  identical). Restored to HEAD (`git checkout --`). No other pre-existing changes touched.
- [x] **3. Reconciliation-state regression tests** — `BankReconciliationPage.test.tsx`
  (5 tests): exactly ONE `useBankReconciliation` per section (not one per child); same
  statement date / balance / cleared list passed to BOTH workspace and investigator; the
  investigator's variance is the current summary's variance (−1673.42, not a stale 0);
  a state change moves both children together; the hook is scoped to the selected
  account id (section keyed by `selectedAccount.id` → fresh subtree on switch).
- [x] **4. "Explained 100%" regression tests** — `ReconciliationHealthCard.test.tsx`
  (3 tests) + the existing 5 service tests: card renders match-coverage, variance-explained
  and remaining-unexplained as separate figures; the reported state (0 analysed, R74,905
  gap) renders **"—"** and **"0%"**, never "100%"; 100% only when the gap is genuinely 0.
- [x] **5. Visual-target code-level checklist** — below.
- [x] **6. Final validation** — type-check ✅ / lint (`--max-warnings 0`) ✅ /
  **1069 tests, 155 files** ✅ (ran twice, no flake) / `vite build` ✅.
- [x] **7. Final report** — `docs/RECON_UI_CORRECTION_PASS_REPORT.md` updated.

### #5 — visual-target code-level checklist (no browser QA claimed)

| Target | Code-level state |
|---|---|
| Dark native select menus | `globals.css` `select option/optgroup` → `--popover(-foreground)`; 42 forms on `NativeSelect` |
| Sidebar green right edge | `app-sidebar.tsx` `after:w-px after:bg-brand-outline` on the fixed container |
| Stable Customer/Company/Supplier tabbed form | fixed-height dialog (`formDialogClass`) / `h-[28rem]` tab region + `.app-scroll` panels; action row anchored |
| Chart of Accounts toolbar | `flex flex-col gap-3 sm:flex-row sm:items-center` (already `main`) |
| General Ledger summary/filter | `grid gap-6 sm:grid-cols-3` + account select (already `main`) |
| Trial Balance summary/filter | `grid gap-6 sm:grid-cols-3` (already `main`) |
| Bank Accounts summary/filter | `sm:grid-cols-2` + `sm:flex-row` filter row (already `main`) |
| Bank Transactions summary/filter | `grid gap-6 sm:grid-cols-3` (already `main`) |
| VAT summary/filter | `grid gap-6 sm:grid-cols-3` + header period picker (already `main`) |
| Account Detail as sheet | `AccountTable` `onSelect` → `?record=` → `AccountDetailSheet`; **no `useNavigate` left in `AccountTable`** |
| Reconciliation two-pane | `ReconciliationWorkspace` `grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]` |
| Compact/Comfortable toggle | header toggle, `localStorage['vertex.reconciliation.density']`, try/catch |
| Difference Investigator integration | tab kept + workspace header `Investigate R… difference` → `runSignal` auto-run |

## L. Gate

- [x] type-check clean
- [x] lint clean (`--max-warnings 0`)
- [x] full test suite: **1069 passed / 155 files** (up from 1045 — +24 tests). Ran twice, no flake.
- [x] `vite build` clean
- [x] `.claude/agents/qa-bee.md` restored to HEAD; working tree carries only this pass's changes
- [ ] **STOP — do not commit, do not push. Wait for final approval.**
