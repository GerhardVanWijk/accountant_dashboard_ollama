-- 0079_fixed_asset_estimate_revisions
-- Fixed Assets accounting-integrity Review 3 (docs/FIXED_ASSETS.md, Open Item 1).
-- AUTHORED, NOT APPLIED.
--
-- Effective-dated change-in-accounting-estimate history for fixed assets
-- (IAS 8.36 / IAS 16.51). Replaces the previous overwrite-only
-- `fixedAssetService.reviseEstimate()`, which mutated the `fixed_assets`
-- estimate columns in place and left only a best-effort generic audit-log
-- row — so the depreciation engine could not authoritatively determine
-- which estimate applied to a historical period during a catch-up run.
--
-- SCHEMA DECISIONS
--   * This is authoritative ACCOUNTING history, not UI audit history — it is
--     the source the depreciation planner reconstructs the estimate timeline
--     from. Same append-only guarantee as `depreciation_entries` /
--     `asset_disposals` (migration 0007): SELECT + INSERT only, UPDATE /
--     DELETE / TRUNCATE revoked. A mistaken revision is corrected by a
--     further (superseding) revision, never edited or deleted.
--   * `effective_date` is always the FIRST DAY OF A MONTH. Estimate changes
--     take effect on an accounting-period boundary (documented, and
--     validated in `fixedAssetService.reviseEstimate()`), so a revision
--     never splits a monthly depreciation charge and every posted period is
--     unambiguously governed by exactly one estimate.
--   * PRECEDENCE (documented in docs/FIXED_ASSETS.md): for any period the
--     applicable estimate is the revision row with the greatest
--     `effective_date <= period start`; before the earliest revision, the
--     earliest revision's `previous_*` values (the estimate that applied
--     from acquisition); with no revisions at all, the `fixed_assets`
--     baseline columns, effective from `acquisition_date`. The
--     `fixed_assets` estimate columns remain a denormalised "current
--     estimate" cache for read-side / UI / integrity checks and are never
--     consulted for a historical period once any revision exists.
--   * `previous_*` columns are stored so the revision table is
--     self-sufficient for reconstruction — the pre-first-revision baseline
--     does not depend on a mutable snapshot.
--   * `useful_life_years` means the revised TOTAL useful life measured from
--     the acquisition date (same meaning as `fixed_assets.useful_life_years`
--     — one meaning everywhere), not a "remaining life".
--   * `asset_id` is upgraded to a COMPOSITE FK to `fixed_assets(company_id,
--     id)`. `fixed_assets` had no `(company_id, id)` candidate key (0007);
--     this migration adds it (the 0037 / 0050 / 0059 direction), so a
--     cross-company `asset_id` on a revision row is structurally impossible.

alter table public.fixed_assets
  add constraint fixed_assets_company_id_id_key unique (company_id, id);

create table public.fixed_asset_estimate_revisions (
  id                                     uuid primary key default gen_random_uuid(),
  company_id                             uuid not null references public.companies(id) on delete cascade,
  asset_id                               uuid not null,
  effective_date                         timestamptz not null,
  useful_life_years                      numeric(6, 2) not null,
  residual_value                         numeric(14, 2) not null,
  depreciation_method                    public.depreciation_method not null,
  reducing_balance_rate_percent          numeric(5, 2),
  previous_useful_life_years             numeric(6, 2) not null,
  previous_residual_value                numeric(14, 2) not null,
  previous_depreciation_method           public.depreciation_method not null,
  previous_reducing_balance_rate_percent numeric(5, 2),
  reason                                 text,
  created_by                             text,
  created_at                             timestamptz not null default now(),
  updated_at                             timestamptz not null default now(),
  unique (company_id, asset_id, effective_date),
  constraint fasr_useful_life_positive check (useful_life_years > 0),
  constraint fasr_residual_non_negative check (residual_value >= 0),
  constraint fasr_reducing_balance_rate_present
    check (depreciation_method <> 'reducing_balance' or reducing_balance_rate_percent is not null),
  foreign key (company_id, asset_id) references public.fixed_assets(company_id, id)
);

create index fixed_asset_estimate_revisions_company_id_idx on public.fixed_asset_estimate_revisions (company_id);
create index fixed_asset_estimate_revisions_asset_id_idx on public.fixed_asset_estimate_revisions (asset_id);

alter table public.fixed_asset_estimate_revisions enable row level security;

-- Append-only (SELECT/INSERT only), same pattern as depreciation_entries / asset_disposals.
create policy fixed_asset_estimate_revisions_select_own_company
  on public.fixed_asset_estimate_revisions for select to authenticated
  using (company_id = (select public.get_my_company_id()));
create policy fixed_asset_estimate_revisions_insert_own_company
  on public.fixed_asset_estimate_revisions for insert to authenticated
  with check (company_id = (select public.get_my_company_id()));

revoke update, delete, truncate on public.fixed_asset_estimate_revisions from anon, authenticated;
revoke all on public.fixed_asset_estimate_revisions from anon;
