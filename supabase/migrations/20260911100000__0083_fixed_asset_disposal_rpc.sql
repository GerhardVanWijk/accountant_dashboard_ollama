-- 0083_fixed_asset_disposal_rpc
-- Fixed Assets accounting-integrity Review 4 (Final Transactional Completion).
-- AUTHORED, NOT APPLIED. Apply AFTER 0079, 0080, 0082 (composite FK / VAT
-- table / VAT uniqueness this function and its guards depend on).
--
-- Makes "dispose a fixed asset" a SINGLE atomic, idempotent, concurrency-safe
-- operation — same pattern as apply_customer_deposit (0046) and
-- post_asset_depreciation_period (0081). Before this migration,
-- AssetDisposalService.disposeAsset() made 4 separate, independently-
-- committing Supabase calls (post journal, update fixed_assets, insert
-- asset_disposals, insert vat_source_entries) — see docs/FIXED_ASSETS.md
-- Review 3/4's "Disposal transaction atomicity: not atomic" finding, and the
-- probe test that reproduced a partial-failure state (GL journal + disposed
-- status + disposal row, but NO vat_source_entries row, with retry
-- permanently blocked by the "already disposed" guard). All four writes now
-- commit inside this one function, or none of them do.
--
-- SCOPE: TypeScript (assetDisposalService.ts) still owns every policy
-- decision and every calculation — gross/net proceeds, VAT amount and rate,
-- gain/loss, which journal lines to post, whether the disposal is taxable.
-- This function performs NO VAT/gain-loss arithmetic; it takes the
-- already-computed values and either commits the whole disposal event or
-- rolls all of it back.
--
-- CATCH-UP DEPRECIATION stays OUTSIDE this function — depreciationService
-- brings the asset current via its own post_asset_depreciation_period
-- call(s) (one per missed period, each its own accounting event) BEFORE
-- assetDisposalService calls this function. Mixing historical catch-up
-- postings into the disposal transaction would blur period boundaries this
-- schema deliberately keeps apart (see 0081's header).
--
-- IDEMPOTENCY / CONCURRENCY:
--   * `fixed_asset_disposal_log` — UNIQUE (company_id, disposal_id).
--     `disposal_id` is a UUID the caller generates once per "dispose this
--     asset" intent (src/lib/uuid.ts's newUuid(), same convention as
--     apply_customer_deposit's allocation_id) and re-uses on retry.
--   * `asset_disposals` gets UNIQUE (company_id, asset_id) — an asset can
--     structurally never have more than one disposal row, independent of
--     disposal_id bookkeeping.
--   * The function LOCKS the fixed_assets row FOR UPDATE and re-validates
--     its status against the LOCKED row (mirrors apply_customer_deposit's
--     receipt/invoice re-validation) — two concurrent disposal calls for the
--     same asset serialise on that lock; the second sees status = 'disposed'
--     (or the UNIQUE (company_id, asset_id) constraint, whichever fires
--     first) and fails cleanly instead of double-disposing.
--   * VAT evidence idempotency reuses 0082's partial unique index on
--     vat_source_entries — this function never needs its own VAT dedup logic.
--
-- FUTURE-REVISION GUARD (Review 4 Item L): an asset can carry an
-- estimate revision with an effective_date in the future (created while
-- still active) and then be disposed before that date arrives.
-- `fixed_asset_estimate_revisions` is append-only with no
-- cancellation/supersession state, so silently proceeding would leave a
-- revision "in effect" on a derecognised asset. This function refuses the
-- disposal outright when such a revision exists — the safe default from the
-- review brief — rather than inventing a cancellation workflow this pass.

alter table public.asset_disposals
  add constraint asset_disposals_company_asset_key unique (company_id, asset_id);

create table public.fixed_asset_disposal_log (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies(id) on delete cascade,
  disposal_id          uuid not null,
  asset_id             uuid not null,
  journal_entry_id     uuid references public.journal_entries(id),
  asset_disposal_id    uuid references public.asset_disposals(id),
  vat_source_entry_id  uuid references public.vat_source_entries(id),
  created_by           text,
  created_at           timestamptz not null default now(),
  unique (company_id, disposal_id)
);

create index fixed_asset_disposal_log_company_id_idx on public.fixed_asset_disposal_log (company_id);
create index fixed_asset_disposal_log_asset_id_idx on public.fixed_asset_disposal_log (asset_id);

alter table public.fixed_asset_disposal_log enable row level security;

create policy fixed_asset_disposal_log_all_own_company on public.fixed_asset_disposal_log
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

-- ========================================================================
-- The atomic executor
-- ========================================================================
-- p_lines: the disposal journal's lines (already computed — cost removal,
--   accumulated-depreciation clearing, proceeds, output VAT, gain/loss).
-- p_vat: null for an out-of-scope disposal, else
--   { tax_rate_id, treatment, direction, taxable_amount, vat_amount,
--     gross_amount, classification, reason }.
create or replace function public.post_fixed_asset_disposal(
  p_disposal_id               uuid,
  p_asset_id                  uuid,
  p_disposal_date             timestamptz,
  p_memo                      text,
  p_source                    text,
  p_lines                     jsonb,
  p_proceeds                  numeric,
  p_carrying_value            numeric,
  p_accumulated_depreciation  numeric,
  p_gain_loss                 numeric,
  p_vat                       jsonb,
  p_created_by                text
) returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_company   uuid := (select public.get_my_company_id());
  v_log_id    uuid;
  v_existing  public.fixed_asset_disposal_log;
  v_asset     public.fixed_assets;
  v_je        public.journal_entries;
  v_disposal  public.asset_disposals;
  v_vat_id    uuid;
begin
  if v_company is null then
    raise exception 'post_fixed_asset_disposal: no company context';
  end if;
  if p_disposal_id is null then
    raise exception 'post_fixed_asset_disposal: disposal_id is required';
  end if;

  -- IDEMPOTENCY on the STABLE disposal id.
  insert into public.fixed_asset_disposal_log (company_id, disposal_id, asset_id, created_by)
  values (v_company, p_disposal_id, p_asset_id, p_created_by)
  on conflict (company_id, disposal_id) do nothing
  returning id into v_log_id;

  if v_log_id is null then
    select * into v_existing from public.fixed_asset_disposal_log
      where company_id = v_company and disposal_id = p_disposal_id;
    select * into v_disposal from public.asset_disposals where id = v_existing.asset_disposal_id;
    return jsonb_build_object(
      'idempotent', true,
      'journal_entry_id', v_existing.journal_entry_id,
      'disposal', to_jsonb(v_disposal),
      'vat_source_entry_id', v_existing.vat_source_entry_id);
  end if;

  -- LOCK the asset — serialises a concurrent disposal attempt on the same asset.
  select * into v_asset from public.fixed_assets
    where id = p_asset_id and company_id = v_company
    for update;
  if not found then
    raise exception 'post_fixed_asset_disposal: asset % not found in company', p_asset_id;
  end if;

  -- RE-VALIDATE against the LOCKED row.
  if v_asset.status = 'draft' then
    raise exception 'post_fixed_asset_disposal: asset % has not been capitalized yet (still a draft)', v_asset.asset_number;
  end if;
  if v_asset.status = 'disposed' then
    raise exception 'post_fixed_asset_disposal: asset % has already been disposed', v_asset.asset_number;
  end if;
  if abs(v_asset.accumulated_depreciation - p_accumulated_depreciation) > 0.005 then
    raise exception 'post_fixed_asset_disposal: asset % accumulated depreciation changed (% vs %) since this disposal was computed — recompute and retry', v_asset.asset_number, v_asset.accumulated_depreciation, p_accumulated_depreciation;
  end if;

  -- FUTURE-REVISION GUARD (Review 4 Item L).
  if exists (
    select 1 from public.fixed_asset_estimate_revisions r
    where r.company_id = v_company and r.asset_id = p_asset_id
      and r.effective_date > p_disposal_date
  ) then
    raise exception 'post_fixed_asset_disposal: asset % has an estimate revision effective after % — correct or account for that revision before disposing this asset', v_asset.asset_number, p_disposal_date::date;
  end if;

  -- open accounting period (create_journal_entry_with_lines does not check).
  if not exists (
    select 1 from public.accounting_periods p
    where p.company_id = v_company and p.status = 'open'
      and p_disposal_date::date between p.start_date and p.end_date
  ) then
    raise exception 'post_fixed_asset_disposal: no open accounting period covers %', p_disposal_date::date;
  end if;

  -- POST the balanced disposal journal via the canonical atomic path.
  v_je := public.create_journal_entry_with_lines(
    v_company, '', p_disposal_date, p_memo, 'posted', now(), null, p_source, null, p_lines
  );

  -- Disposal evidence row — UNIQUE (company_id, asset_id) is the hard
  -- backstop against a double disposal even if two concurrent calls somehow
  -- both got past the lock above (they cannot, under normal Postgres
  -- locking, but the constraint costs nothing and matches this schema's
  -- "belt and braces" convention — see 0004/0046).
  insert into public.asset_disposals (
    company_id, asset_id, disposal_date, proceeds, carrying_value_at_disposal,
    accumulated_depreciation_at_disposal, gain_loss, journal_entry_id
  ) values (
    v_company, p_asset_id, p_disposal_date, p_proceeds, p_carrying_value,
    p_accumulated_depreciation, p_gain_loss, v_je.id
  ) returning * into v_disposal;

  update public.fixed_assets
     set status = 'disposed',
         disposal_date = p_disposal_date,
         disposal_proceeds = p_proceeds,
         disposal_journal_entry_id = v_je.id,
         updated_at = now()
   where id = p_asset_id and company_id = v_company;

  -- VAT evidence — only for a taxable disposal. Relies on 0082's partial
  -- unique index (company_id, source_type, source_id) where
  -- reverses_entry_id is null for original-entry idempotency; this INSERT
  -- would already be unreachable a second time for the same disposal
  -- because the disposal_id idempotency log above short-circuits first.
  if p_vat is not null then
    insert into public.vat_source_entries (
      company_id, source_type, source_id, transaction_date, tax_rate_id, treatment,
      direction, taxable_amount, vat_amount, gross_amount, classification, journal_entry_id, reason
    ) values (
      v_company, 'asset_disposal', v_disposal.id, p_disposal_date, (p_vat ->> 'tax_rate_id')::uuid,
      (p_vat ->> 'treatment')::public.vat_treatment, (p_vat ->> 'direction')::public.vat_source_direction,
      (p_vat ->> 'taxable_amount')::numeric, (p_vat ->> 'vat_amount')::numeric, (p_vat ->> 'gross_amount')::numeric,
      p_vat ->> 'classification', v_je.id, p_vat ->> 'reason'
    ) returning id into v_vat_id;
  end if;

  update public.fixed_asset_disposal_log
     set journal_entry_id = v_je.id, asset_disposal_id = v_disposal.id, vat_source_entry_id = v_vat_id
   where id = v_log_id;

  return jsonb_build_object(
    'idempotent', false,
    'journal_entry_id', v_je.id,
    'disposal', to_jsonb(v_disposal),
    'vat_source_entry_id', v_vat_id);
end;
$$;

revoke all on function public.post_fixed_asset_disposal(
  uuid, uuid, timestamptz, text, text, jsonb, numeric, numeric, numeric, numeric, jsonb, text
) from public, anon;
grant execute on function public.post_fixed_asset_disposal(
  uuid, uuid, timestamptz, text, text, jsonb, numeric, numeric, numeric, numeric, jsonb, text
) to authenticated;
