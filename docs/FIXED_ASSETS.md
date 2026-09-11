# Fixed Assets — depreciation engine, disposal, open items

Scope: `src/features/assets`. Covers the register, the depreciation run, disposal,
and the two schema gaps that block full IAS 8 / VAT-return reproducibility.

## Depreciation run — one journal per accounting period

`DepreciationService.runDepreciation(throughDate)` brings every `active` asset
current to `throughDate`, catching up every unposted month. A single run can
produce **several** journals: **one per calendar month, dated in that month**.
Multiple assets sharing a month are combined into that month's one entry
(DR Depreciation Expense / CR Accumulated Depreciation per asset).

Depreciation belonging to different accounting periods is never collapsed into
the run's target month — June's charge posts in a June-dated journal, July's in
July, and so on. This keeps monthly GL / Income Statement figures correct.

`DepreciationEntry` rows stay one-per-asset-per-month and each points at the
journal for its own month.

### Locked periods

Before anything posts, each month is classified against the accounting-period
calendar (`findPeriodForDate`). A month whose period is `closed` / `locked`
(or for which no period is defined) is **Blocked**. When a month is blocked,
that month **and every later month for the same asset** are held back — posting
a later month while an earlier one is blocked would leave the asset's
accumulated-depreciation history non-reconstructable.

Blocked periods are:

* returned from `runDepreciation` as `result.blockedPeriods`;
* shown in the run dialog preview as `Blocked`, with the reason, before posting;
* never forced through, never silently skipped, never rolled into a later month.

`catchUpToDate` (used by disposal) **throws** if any month up to the disposal
date is blocked — an asset must not be disposed on a stale carrying value.
Reopen and post the period, or dispose at an earlier date.

## Day-count convention — actual/actual (ISDA)

`depreciationMath.ts`. The denominator for a daily rate is the **real length of
the calendar year the charge falls in**: **365 in an ordinary year, 366 in a
leap year**. No 365.25 approximation. Every coverage window here sits inside a
single calendar month (hence a single year), so the year's true length is
always knowable.

* Straight-line: `remaining depreciable amount ÷ remaining calendar days to the
  straight-line end date × days in the period`, recomputed every period (a
  later change in estimate self-corrects prospectively — IAS 8).
* Reducing-balance: `carrying value × annual rate × (days in period ÷
  daysInYear(year))`.
* `addYears` counts a fractional year as that fraction of the landing year's
  real day count.

## Register ↔ GL reconciliation

`reconcileAssetRegisterToGl` — Σ register cost / accumulated depreciation of
on-book assets vs the posted GL balances of the mapped accounts. Zero variance
after acquisition, multi-month depreciation, catch-up, disposal (gain/loss),
and VAT disposal. Non-zero variance is surfaced, never journalled away.

## Account mapping

`AssetForm` resolves the three posting accounts by Chart-of-Accounts **code**
(`1500` Fixed Asset, `1590` Accumulated Depreciation, `5200` Depreciation
Expense). These are exactly the codes `AccountMappingService.ACCOUNT_CODE_BY_KEY`
maps `FIXED_ASSET` / `ACCUMULATED_DEPRECIATION` / `DEPRECIATION_EXPENSE` to —
the same canonical convention, centralised there. `capitalizeFromBillLine`
resolves through `accountMappingService` directly. The invalid `acc_1500` /
`acc_1590` / `acc_5200` literal-id bug is fixed and stays fixed.

---

## Effective-dated estimate revisions (migration 0079)

`FixedAssetService.reviseEstimate()` persists a **`fixed_asset_estimate_revisions`**
row — authoritative accounting history, append-only (SELECT/INSERT only, same as
`depreciation_entries`), company-scoped RLS, composite FK to
`fixed_assets(company_id, id)` (the candidate key is added in the same migration).

### Effective-date rule

`effective_date` is **always the first day of a month** — estimate changes take
effect on an accounting-period boundary (validated in `reviseEstimate`, not
silently snapped). A revision effective 1 July governs July onward and never
re-rates June. `reviseEstimate` also refuses an effective date on or before the
last **posted** depreciation period — a revision can never rewrite history, and
it is not a route around a closed period (missing pre-effective-date depreciation
is still surfaced by the locked-period logic on the next run).

### Estimate precedence (authoritative)

For any depreciation period the applicable estimate is, in order:

1. the revision row with the greatest `effective_date` ≤ the period's first day;
2. before the earliest revision — that revision's `previous_*` snapshot (the
   estimate that applied from acquisition until the first revision);
3. with **no** revisions at all — the `fixed_assets` baseline columns, effective
   from `acquisition_date`.

Rules 1–2 reconstruct the whole timeline from the revision table alone; rule 3
is the only time the `fixed_assets` estimate columns are consulted for a period.
Those columns are otherwise a denormalised "current estimate" cache for
read-side / UI / integrity (refreshed to the latest revision's values on each
revise); they are never the source for a historical period once a revision
exists. `usefulLifeYears` on both the baseline and every revision means the
**total** life from acquisition (one meaning everywhere), not a remaining life.

`depreciationMath.estimateAsOf()` / `planAssetDepreciation(…, revisions)` and
`depreciationService.toEstimateTimeline()` implement this. A catch-up run that
spans a revision computes each month on the estimate that governed it — May &
June on the old estimate, July onward on the new — in a single run, and posted
history is untouched.

## Persisted VAT source/evidence (migration 0080)

`AssetDisposalService` writes a **`vat_source_entries`** row on every in-scope
taxable disposal (append-only, company RLS, composite FK to
`tax_rates(company_id, id)`). It is a **generic** structure keyed by
`source_type` / `source_id`, not disposal-only.

* The VAT rate comes from `taxRateService.getEffectiveRate(vatCode, disposalDate)`
  — the effective-dated `tax_rates` engine. No free-typed percentage, no
  hardcoded 15, no VAT-rate logic inside Fixed Assets. `vatCode` defaults to the
  standard rate (`STD`).
* `vatReportService.computeVatReport` / `listVatTransactions` read these rows
  **alongside** their Invoice / Credit Note / Supplier Invoice sources — one
  report calculator, not two. A standard-rated capital-goods disposal flows to
  the `standard_rated` Output-VAT treatment (the report total is unaffected by
  classification) **and** into `VatReport.outputVat.capitalGoods` / `inputVat
  .capitalGoods` — a disclosure sub-total over the same rows, never a second
  addition. `listVatTransactions` carries `classification` through onto each
  `vat_source` row for the transaction drill-down.
* `reconcileVatControlAccounts` therefore reconciles to **R0.00** after a taxable
  disposal — both the report total and the GL VAT-Output movement include it. No
  special-casing of the disposal journal.
* Gain/loss is on **net** proceeds; output VAT never inflates the gain.
* Uniqueness: a partial unique index on `vat_source_entries (company_id,
  source_type, source_id) where reverses_entry_id is null` (migration 0082)
  guarantees at most one ORIGINAL evidence row per source, while leaving
  contra rows (which always carry `reverses_entry_id`) unconstrained by it.
* A reversal is a **contra** `vat_source_entries` row (negated amounts,
  `reverses_entry_id` set) via `VatSourceEntryService.reverseEntry` — evidence is
  never deleted. There is still no user-facing "reverse a posted disposal"
  workflow — see "Transactional completion" below for why the generic
  ledger-level "Reverse entry" button is now refused for these sources instead
  of being left to silently desync the register.

## Transactional completion (migrations 0081–0084)

Reviews 3/4 found that every multi-table Fixed Assets write — disposal,
one accounting period's depreciation, and an estimate revision — was a
sequence of independent, separately-committing Supabase calls, not one
atomic event: a failure partway through (network blip, RLS hiccup, a
concurrent conflict) could leave a posted GL journal with no matching
subledger row, or vice versa, with no way to retry cleanly and no rollback.
A reproduced probe: a taxable disposal whose VAT-evidence insert failed left
the GL journal posted, the asset flipped to `disposed`, and the
`asset_disposals` row written — with **no** `vat_source_entries` row and no
way to retry (the asset was already terminal).

Each of the three commands now goes through ONE atomic Postgres RPC — the
same `SECURITY INVOKER` + implicit-single-transaction pattern already
established by `create_journal_entry_with_lines` (0004) and
`apply_customer_deposit` (0046, "the strongest posting pattern already in
this repo"). TypeScript still owns every policy decision, validation, and
calculation (day-count proration, VAT/gain-loss splits, the estimate
timeline); the RPC only re-validates against LOCKED rows and commits.

| Command | RPC (migration) | Idempotency key | Hard DB backstop |
|---|---|---|---|
| One period's depreciation | `post_asset_depreciation_period` (0081) | `run_id` (client UUID, `fixed_asset_period_posting_log`) | `UNIQUE (company_id, asset_id, period_end)` on `depreciation_entries` |
| Disposal | `post_fixed_asset_disposal` (0083) | `disposal_id` (client UUID, `fixed_asset_disposal_log`) | `UNIQUE (company_id, asset_id)` on `asset_disposals` |
| Estimate revision | `revise_fixed_asset_estimate` (0084) | none needed — 0079's natural `(company_id, asset_id, effective_date)` key | same constraint, reused via `on conflict do nothing` |

"One period = one atomic command = one depreciation journal" is preserved —
a multi-month catch-up run still calls `post_asset_depreciation_period` once
per ready month, in order, so an earlier month's posting survives a later
month being blocked or failing.

The disposal RPC also refuses to run when a **future-effective estimate
revision** already exists for the asset (Review 4 Item L) — `revise
Estimate` revisions are append-only with no supersession/cancellation
state, so a revision effective after the disposal date is blocked outright
rather than silently left "in effect" on a derecognised asset.

`journalEntryService.ts`'s `SUBLEDGER_OWNED_SOURCES` now includes
`fixed_asset_acquisition` / `depreciation` / `asset_disposal` — the generic
ledger "Reverse entry" action refuses all three (same protection AR/AP
documents already had), since a generic reversal would move the GL but
leave `fixed_assets` / `depreciation_entries` / `asset_disposals` /
`vat_source_entries` completely unchanged. No dedicated Fixed Assets
reversal workflow exists yet — this refusal is deliberate rather than
allowing a workflow known to desync the subledger.

TypeScript-side, each RPC has a Real/Fake executor pair
(`disposalExecutor.ts`, `depreciationPeriodExecutor.ts`,
`estimateRevisionExecutor.ts`) — same convention as
`depositAllocationExecutor.ts` — so the atomic contract (all-or-nothing,
idempotent retry) is unit-testable without a live database; see
`transactionalIntegrity.test.ts` and
`fixedAssetTransactionalRpcsMigration.test.ts`.

## Still deferred (honestly unsupported)

Impairment, revaluation, componentisation, advanced SA tax-allowance rules
(s11(e)/s12C/s13 wear-and-tear beyond the indicative rate), and the CGT-on-VAT
interaction remain reported, not implemented.
