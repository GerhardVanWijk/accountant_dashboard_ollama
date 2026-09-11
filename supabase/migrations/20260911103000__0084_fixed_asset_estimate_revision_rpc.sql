-- 0084_fixed_asset_estimate_revision_rpc
-- Fixed Assets accounting-integrity Review 4 (Final Transactional Completion).
-- AUTHORED, NOT APPLIED. Apply AFTER 0079 (this function writes its table).
--
-- Makes "record a change-in-estimate" a SINGLE atomic operation — before
-- this migration, fixedAssetService.reviseEstimate() did two separate
-- Supabase calls (insert fixed_asset_estimate_revisions, then update
-- fixed_assets' denormalised "current estimate" cache). A failure between
-- them left an authoritative (append-only, undeletable) revision row on the
-- books with the read-side cache never updated to match it.
--
-- IDEMPOTENCY: no synthetic id is needed here — 0079's own
-- UNIQUE (company_id, asset_id, effective_date) is already the correct
-- natural idempotency key (one asset can have at most one revision per
-- effective month, by design). `insert ... on conflict do nothing` reuses
-- it directly, matching this function's own INSERT to the same rule
-- fixedAssetService.reviseEstimate() already enforces in TypeScript before
-- calling this function.
--
-- CACHE CONSISTENCY (Review 4 Item K): after the insert-or-noop, this
-- function ALWAYS recomputes "the revision with the latest effective_date
-- for this asset" from the table (now including the new row, if any) and
-- writes THAT row's values onto fixed_assets — the exact same "pick the
-- max(effective_date) row" rule fixedAssetService.reviseEstimate() already
-- used to build `currentEstimate` in TypeScript. Doing it this way, inside
-- the same transaction as the insert, on BOTH the fresh-insert path and the
-- idempotent-retry path, means the cache can never end up out of step with
-- the revision table because of a partial write — there is no longer a
-- window where one commits and the other doesn't. It also self-heals any
-- pre-existing drift (e.g. from a legacy manual edit) the moment a new
-- revision is filed — reading it does not silently fix it before that,
-- which is why assetRegisterIntegrityService also gained an
-- `estimate_snapshot_mismatch` read-side check (TypeScript-only, no DB
-- change needed for a read-side audit).
create or replace function public.revise_fixed_asset_estimate(
  p_asset_id                                uuid,
  p_effective_date                          date,
  p_useful_life_years                       numeric,
  p_residual_value                          numeric,
  p_depreciation_method                     text,
  p_reducing_balance_rate_percent           numeric,
  p_previous_useful_life_years              numeric,
  p_previous_residual_value                 numeric,
  p_previous_depreciation_method            text,
  p_previous_reducing_balance_rate_percent  numeric,
  p_reason                                  text,
  p_created_by                              text
) returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_company   uuid := (select public.get_my_company_id());
  v_asset     public.fixed_assets;
  v_rev_id    uuid;
  v_latest    public.fixed_asset_estimate_revisions;
  v_reactivate boolean;
  v_idempotent boolean := false;
begin
  if v_company is null then
    raise exception 'revise_fixed_asset_estimate: no company context';
  end if;

  select * into v_asset from public.fixed_assets
    where id = p_asset_id and company_id = v_company
    for update;
  if not found then
    raise exception 'revise_fixed_asset_estimate: asset % not found in company', p_asset_id;
  end if;
  if v_asset.status not in ('active', 'fully_depreciated') then
    raise exception 'revise_fixed_asset_estimate: asset % is % — estimates can only be revised on a capitalized asset still on the books', v_asset.asset_number, v_asset.status;
  end if;

  insert into public.fixed_asset_estimate_revisions (
    company_id, asset_id, effective_date, useful_life_years, residual_value, depreciation_method,
    reducing_balance_rate_percent, previous_useful_life_years, previous_residual_value,
    previous_depreciation_method, previous_reducing_balance_rate_percent, reason, created_by
  ) values (
    v_company, p_asset_id, p_effective_date, p_useful_life_years, p_residual_value,
    p_depreciation_method::public.depreciation_method, p_reducing_balance_rate_percent,
    p_previous_useful_life_years, p_previous_residual_value,
    p_previous_depreciation_method::public.depreciation_method, p_previous_reducing_balance_rate_percent,
    p_reason, p_created_by
  )
  on conflict (company_id, asset_id, effective_date) do nothing
  returning id into v_rev_id;

  if v_rev_id is null then
    v_idempotent := true;
  end if;

  -- Recompute the cache from whichever revision now has the latest
  -- effective_date — unconditionally, on both paths (see header).
  select r.* into v_latest
    from public.fixed_asset_estimate_revisions r
   where r.company_id = v_company and r.asset_id = p_asset_id
   order by r.effective_date desc
   limit 1;

  v_reactivate := v_asset.status = 'fully_depreciated'
    and (v_asset.cost - v_latest.residual_value - v_asset.accumulated_depreciation) > 0.005;

  update public.fixed_assets
     set useful_life_years = v_latest.useful_life_years,
         residual_value = v_latest.residual_value,
         depreciation_method = v_latest.depreciation_method,
         reducing_balance_rate_percent = v_latest.reducing_balance_rate_percent,
         status = case when v_reactivate then 'active'::public.fixed_asset_status else status end,
         updated_at = now()
   where id = p_asset_id and company_id = v_company;

  return jsonb_build_object(
    'idempotent', v_idempotent,
    'revision', (select to_jsonb(r) from public.fixed_asset_estimate_revisions r
                 where r.company_id = v_company and r.asset_id = p_asset_id and r.effective_date = p_effective_date));
end;
$$;

revoke all on function public.revise_fixed_asset_estimate(
  uuid, date, numeric, numeric, text, numeric, numeric, numeric, text, numeric, text, text
) from public, anon;
grant execute on function public.revise_fixed_asset_estimate(
  uuid, date, numeric, numeric, text, numeric, numeric, numeric, text, numeric, text, text
) to authenticated;
