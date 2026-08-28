# Browser-Driven UI Correction Pass — Final Report

**Date:** 2026-08-27 · **Status:** complete + final cleanup done, **NOT committed / NOT
pushed** — awaiting final approval. Task tracker: `docs/CURRENT_TASKS.md`.

---

## Final cleanup pass (post-approval requests)

1. **Unrelated file cleanup** — `git diff .claude/agents/qa-bee.md` confirmed
   **whitespace-only** (a sentence split across 3 lines, stray spaces, words identical).
   **Restored to HEAD** (`git checkout -- .claude/agents/qa-bee.md`). No other pre-existing
   changes touched. Working tree now carries only this pass's changes.
2. **Reconciliation-state regression tests** — new `BankReconciliationPage.test.tsx`,
   **5 tests, pass**: one `useBankReconciliation` instance per section (not one per child);
   identical statement date / balance / cleared list to both workspace + investigator;
   investigator variance = current summary variance (−1673.42, not stale 0); state changes
   move both together; hook scoped to the selected account id (section keyed by
   `selectedAccount.id`).
3. **"Explained 100%" regression tests** — new `ReconciliationHealthCard.test.tsx`,
   **3 tests, pass** (+ 5 existing service tests): three separate figures rendered; the
   reported state (0 analysed, R74,905 gap) renders "—" / "0%", never "100%"; 100% only
   when the gap is genuinely closed.
4. **Demo data is dev/test-only** — `demoReconciliationScenario.ts` doc comment now states
   it explicitly; verified nothing app-side imports it (sole consumer is its own
   `.test.ts`). **No production seed button. No live-DB insert.**
5. **Final type-check** — clean.
6. **Final lint** — clean (`--max-warnings 0`).
7. **Final test count** — **1069 passed / 155 files** (ran twice, no flake). +24 vs the
   1045 baseline.
8. **Final production build** — clean (`vite build`; pre-existing chunk-size advisory
   unchanged).
9. **Modified / untracked files** — 84 modified, 10 untracked (list at §"Exact files").
10. **Remaining limitations** — see §32. Unchanged: no browser visual QA (no tooling); the
    live "Seed reconciliation demo" is deliberately not built; `SELECT DISTINCT` / TB
    `GROUP BY` server-side aggregation not done (needs an RPC + test-fake changes).

---

---

## 0. Headline finding — the deployed app is behind `main`

Items **#8–#13** (vertical-stacked summaries / filters) reproduce **only on a stale
deployment**. On current `main` every one of those pages already uses a responsive
horizontal layout (landed M3 2026-08-25 + the six visual-fidelity-audit commits + today's
`9fd1666`). The global audit (#13) found **zero** pages with a non-responsive
`grid-cols-1`/`flex-col` summary or filter row. Five straggler list pages that rendered 4
stat tiles as a `sm:grid-cols-2` 2×2 block were tightened to `lg:grid-cols-4`.

**Please re-check the screenshots against a fresh `npm run dev` / redeploy.**

---

## 1. Global dropdown — root cause

~34 forms used a bare native `<select>` styled `bg-transparent` (like `Input`). Closed it
looks right. **Open**, the browser paints the option list from the element's own
background: on Windows Chromium a transparent `<select>` renders the popup near-white
while the `<option>` text keeps the inherited near-white `--foreground` → most options
unreadable in dark mode (the exact "Legal entity type" bug). The shadcn `Select`
(base-ui, `bg-popover`) and the DataTable filter selects were never affected.

## 2. Global dropdown — fix

- `src/styles/globals.css` `@layer base`: `select option / optgroup` pinned to
  `--popover` / `--popover-foreground` (theme-aware, and un-overridable by a utility
  class since nothing targets `<option>` from the utilities layer); `:disabled` →
  `--muted-foreground`; `:checked` / `:hover` → `--brand-muted` green. Solid-background
  fallback on the trigger. `color-scheme` was already correct on `<html>`.
- New shared `NativeSelect` (`src/components/ui/shadcn/native-select.tsx`, forwardRef,
  `data-slot`, matches `Input`) — **all 42 forms migrated** off the copy-pasted
  `selectClassName` string (`grep "<select"` / `"selectClassName"` over `src` now
  returns nothing).

## 3. Sidebar green edge + scrollbar

`app-sidebar.tsx`: a 1px `bg-brand-outline` (30% green) `after:` line on the *fixed*
sidebar container's right edge — holds position while the nav scrolls. New
`.sidebar-scroll` utility (thin, transparent track, 32%→55% green thumb) replaces the
old no-op `no-scrollbar` on `SidebarContent`; `.no-scrollbar` kept (now actually
defined) for the command palette; `.app-scroll` added for in-app panes.

## 4. Form sizing architecture

`src/components/app/form-surface.ts`:
| class | use | behaviour |
|---|---|---|
| `formDialogClass` | multi-tab forms | **fixed** `md:h-[min(88dvh,44rem)]` — tab switches can't resize it |
| `wideFormDialogClass` | line-item editors | `sm:max-w-4xl`, natural height, `88dvh` cap |
| `standardDialogClass` | ordinary forms | `sm:max-w-2xl`, natural height, `88dvh` cap |
| `compactDialogClass` | small confirms | `sm:max-w-lg` |

The green ring + internal-scroll body wrapper + sticky footer were already built into
`DialogContent`/`SheetContent`. Rolled the classes across the 13 `*FormModal.tsx`.

## 5. Forms audited

Only **3 forms in the whole app use `<Tabs>`**: CustomerForm, SupplierForm,
TransactionForm — all reworked so the tab region is a fixed/`flex-1` height and each
panel scrolls internally (`.app-scroll`), with the action row anchored. CompanyForm (not
tabbed) given the same stable-height treatment. All 42 select-bearing forms migrated to
`NativeSelect`.

## 6. Chart of Accounts — performance root cause + before/after

**Cause (severe N+1):** `useAccounts.load()` did
`Promise.all(accounts.map(a => accountService.hasPostings(a.id)))`, and `hasPostings()`
itself calls `journalRepository.getAll()` — so opening the Chart of Accounts fetched the
**entire journal history once per account** (~50–150 full-ledger fetches), again after
every create/edit, all serialised behind the browser's 6-connections-per-host cap (which
also starved every other query on the page — and on Ledger / Trial Balance, which also
call `useAccounts()`).

**Fix:** new `AccountService.getAccountIdsWithPostings()` — one ledger pass for the whole
chart. `useAccounts` now does `Promise.all([getAccounts(), getAccountIdsWithPostings()])`.

**Before / after:** `2 + N` round trips (N of them full-ledger) → **exactly 2**, in
parallel. No browser tooling here, so no wall-clock ms — the structural change is the
report.

**Not done (needs an RPC + `IJournalEntryRepository` change across ~10 test fakes):**
`SELECT DISTINCT account_id FROM journal_lines` to avoid pulling line bodies;
server-side `GROUP BY` for the trial balance.

## 7. Account Detail Sheet

New `src/features/accounting/components/AccountDetailSheet.tsx` — clicking an account row
opened `navigate('/accounting/ledger')` (`AccountTable.tsx:31`); now it opens a side
sheet via `?record=<id>` and **stays on the Chart of Accounts**. Shows code, name, master
type, FS grouping (subType), status, normal balance, ledger-history flag, description,
**current balance + the 5 most recent ledger lines** (from `useAccountLedger` →
`getAccountLedger()`, never recomputed). Actions: **Edit** (opens the existing form
modal) and **View ledger** (the old navigate, now explicit). `AccountTable` gained an
`onSelect` prop and dropped its `useNavigate`/`accountingUiStore` coupling. Uses the
shared `RecordDetailSheet` + `recordSheetClass`.

## 8. Trial Balance — performance root cause + before/after

Same `useAccounts()` N+1 as #6 (the page calls it) — fixed. `computeTrialBalance()`
itself: 2 queries + one O(lines) client-side sum, unchanged. Subledger reconciliation on
this page already loaded **independently** (its own `reconciliationLoading`, separate
section) — it does not block the main TB display; confirmed.

## 9–13. Layout changes

Already correct in `main` (see §0). Fixed 5 straggler list pages
(SupplierListPage, InvoicesPage, CreditNotesPage, CustomerListPage, JournalsPage):
`sm:grid-cols-2` → `sm:grid-cols-2 lg:grid-cols-4` so 4 stat tiles form a 1×4 strip on
desktop, matching the ~14 pages that already did. No changes needed to General Ledger /
Trial Balance / Bank Accounts / Bank Transactions / VAT layouts.

## 14–17. Bank Reconciliation workspace redesign

`ReconciliationWorkspace.tsx` rebuilt as a **two-pane, transaction-by-transaction**
surface (Xero *workflow*, not visuals):

- **Header (shared state):** statement date, statement closing balance, book (GL)
  balance, variance (green/red), balanced status, **"Investigate R{variance} difference"**
  button, **Compact / Comfortable** density toggle (persisted to
  `localStorage['vertex.reconciliation.density']`, try/catch).
- **LEFT:** every statement line for the period — compact rows (date, description,
  reference, spent/received, status chip: Reconciled / Cleared this session / Needs
  allocation / Unreconciled), filterable.
- **RIGHT:** the selected line — details, source (imported / manual / transfer), its GL
  coding (or "not yet coded"), and its actions: **Code to a GL account** (opens the real
  `AllocateTransactionForm` — normal posting, not bypassed), **Mark / Un-clear**,
  **Open in Bank Transactions**.

**Real bug fixed:** the page had `useBankReconciliation` instantiated **twice** (section
+ workspace) — so the Difference Investigator tab always saw the *default* statement
date / R0 balance / no cleared items, disconnected from what the user typed. State is now
lifted to one instance on the page and passed to both the workspace and the investigator.

The Difference Investigator **tab is kept** and is also reachable from the workspace
header, which switches to it and auto-runs against the real current state (new `runSignal`
prop).

## 18–21. Reconciliation demo data + investigator verification

- **#19 dataset:** `src/features/reconciliationIntelligence/testFixtures/demoReconciliationScenario.ts`
  — a pure builder: FNB Business Cheque, Aug 2026, R100k opening, ~35 bank + books rows
  with every seeded fault the brief lists (10 clean matches, 3 date-offset, R10k→3
  deposit, missing R185.50 charge, R62.10 interest, R47.50 vs R47.66 mismatch, duplicate
  rent, wrong-sign refund, wrong-account EFT, outstanding payment + deposit, VAT split,
  pair & triple orphaned-journal combinations). Deterministic `expectedVariance` + an
  `expectedFaults` manifest.
- **#21 verification:** `demoReconciliationScenario.test.ts` runs the **real**
  `ReconciliationInvestigatorService` over it. **7 tests, all pass.** Expected vs actual:

  | Seeded fault | Investigator result |
  |---|---|
  | Missing R185.50 bank charge | `missing_ledger_side`, `effectAmount ≈ 185.50` ✅ |
  | R62.10 interest not booked | `missing_ledger_side` ✅ |
  | Card fee books R47.50 / bank R47.66 | `amount_mismatch`, `effectAmount ≈ 0.16`, explanation names "card machine" / 47.5 / 47.66 ✅ |
  | Landlord rent booked twice | `duplicate_transaction` ✅ |
  | Supplier refund booked wrong way | `wrong_sign` ✅ |
  | R10,000 deposit = 3 receipts | `grouped_match` ✅ |
  | Variance = pair sum R801.25 | `combination_match`, `effectAmount ≈ 801.25` ✅ |
  | Variance = triple sum R475.15 | `combination_match` ✅ |
  | Every issue's initial status | `'open'` (a suggestion, never pre-applied) ✅ |

- **#18 / #20 not done:** wiring this to a live "Seed reconciliation demo" (dev button or
  a Supabase migration) writes ~35 fake bank transactions + journals into the user's
  **real single-tenant Supabase project** — needs an explicit go-ahead. The builder is
  ready to drive it.

## 22. "Explained 100%" metric fix

`reconciliationHealthService.ts` reshaped. `ReconciliationHealth` now separates the two
questions:
- **`matchCoveragePercent`** — `null` (shown as "—"), **not** "100%", when nothing was
  analysed.
- **`varianceExplained`** (Rand with a candidate cause, capped at `|variance|`),
  **`varianceRemaining`**, **`varianceExplainedPercent`** (reaches 100 only when the gap
  is genuinely closed).

`ReconciliationHealthCard` rebuilt: "Transactions analysed / Confirmed / Probable / Needs
review", then "Match coverage / Variance explained / Remaining unexplained". 5 new unit
tests, including the exact reported state: `computeReconciliationHealth(0,0,0,0,74905,0)`
→ `matchCoveragePercent: null`, `varianceRemaining: 74905` — never "100%".

## 23. Detail-sheet consistency

Every record-detail sheet already goes through the shared `RecordDetailSheet`
(full-height `SheetContent`, brand-green ring, own scroll region). None are internally
tabbed. New `AccountDetailSheet` uses the same component + `recordSheetClass`. Nothing
further needed.

## 24. Performance targets

No browser automation in this environment → no wall-clock ms. Reported structurally in
§6 and §8 (`2 + N` full-ledger fetches → 2 parallel queries).

## 25. Supabase query / index changes

Reviewed via MCP (`pg_indexes` + performance advisor). **Every index the brief names
already exists** (`journal_lines_account_id_idx`, `journal_lines_journal_entry_id_idx`,
`journal_entries_company_id_idx`, `journal_entries_date_idx`, `accounts (company_id,
code)`, `bank_transactions_bank_account_id_idx`, reconciliation FK indexes). **No index
migration is warranted** — the slowness was application-layer N+1, not a missing index.

## 26. Loading UX

`ChartOfAccountsPage` and `TrialBalancePage` loading states now keep the page header +
filter shell visible and render a **table-shaped skeleton** (+ 3-tile summary skeleton on
TB) instead of a 40vh centred spinner. Subledger reconciliation on TB was already
independent.

## 27. Migrations

**None.** No schema changes. (`#18/#20` would need one, deferred for approval.)

## 28. Tests added (+16)

- `accountService.test.ts` — 3 (`getAccountIdsWithPostings`)
- `ChartOfAccountsPage.test.tsx` — +1 (opens the detail sheet, does not navigate)
- `reconciliationHealthService.test.ts` — 5 (metric separation, the reported bug)
- `demoReconciliationScenario.test.ts` — 7 (real investigator over the seeded scenario)
- 5 page-test mocks updated for `getAccountIdsWithPostings`; 2 loading-state assertions
  switched to `getByRole('status')`.

## 29. Full test result

**1069 passed / 155 files** (up from 1045 — +24). Ran twice in the final gate, **no
flake**. (An earlier run mid-pass showed `1 failed` once and never reproduced across four
subsequent full runs.)

## 30. type-check / lint / build

- `npm run type-check` — clean
- `npm run lint` (`--max-warnings 0`) — clean
- `npx vite build` — clean (the pre-existing "chunk > 500 kB" advisory is unchanged)

## 31. Browser visual QA

**Not performed — no browser tooling available.** All changes are behind strict
type-check + zero-warning lint + full tests + a production build, and use standard
responsive Tailwind already proven across the app. **The user should do a visual pass**
on a fresh `npm run dev` / deploy — priority: the reconciliation workspace, native-select
option lists in dark mode, the Account Detail Sheet, and tabbed-form sizing.

## 32. Remaining limitations / not-done

1. **#18 / #20** — live "Seed reconciliation demo" (writes to the real Supabase project) —
   needs approval.
2. **#5** further optimisation — `SELECT DISTINCT account_id` / server-side TB `GROUP BY`
   (needs an RPC + interface change across test fakes).
3. **#27** — no browser visual QA.
4. **~20 page-inline `DialogContent`s** still carry ad-hoc `max-w-*` (mostly small
   confirm dialogs, not forms) — low priority, not swept.
5. Reconciliation workspace has **no UI test** (there were none before; covered by
   type-check + the service tests).
6. Reconciliation workspace UI itself has **no render test** (there were none before) —
   covered by type-check + the 5 wiring tests + the service tests.

## Exact modified / untracked files

`.claude/agents/qa-bee.md` **restored to HEAD** — not in the changeset.

**84 modified, 10 untracked** (`git status --short`). Untracked:
- `docs/CURRENT_TASKS.md`, `docs/RECON_UI_CORRECTION_PASS_REPORT.md` (this file)
- `src/components/app/form-surface.ts`
- `src/components/ui/shadcn/native-select.tsx`
- `src/features/accounting/components/AccountDetailSheet.tsx`
- `src/features/accounting/services/accountService.test.ts`
- `src/features/banking/pages/BankReconciliationPage.test.tsx`
- `src/features/reconciliationIntelligence/components/ReconciliationHealthCard.test.tsx`
- `src/features/reconciliationIntelligence/services/reconciliationHealthService.test.ts`
- `src/features/reconciliationIntelligence/testFixtures/` (`demoReconciliationScenario.ts` + `.test.ts`)

The 84 modified break down as: `globals.css` + `sidebar.tsx` + `app-sidebar.tsx` (#2);
42 forms + modals (#1, #3, #4); `useAccounts.ts` / `accountService.ts` / 5 accounting
test files / `AccountTable.tsx` / `ChartOfAccountsPage.tsx` / `ChartOfAccountsPage.test.tsx`
(#5, #6); `TrialBalancePage.tsx` + `.test.tsx` (#8, #26); 5 list pages (#13);
`ReconciliationWorkspace.tsx` / `BankReconciliationPage.tsx` /
`AllocateTransactionFormModal.tsx` (#14–#17); `reconciliationHealthService.ts` /
`reconciliationInvestigatorService.ts` / `ReconciliationHealthCard.tsx` /
`DifferenceInvestigatorPanel.tsx` (#22).
