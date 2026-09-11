-- 0081_fixed_asset_depreciation_period_rpc
-- Fixed Assets accounting-integrity Review 4 (Final Transactional Completion).
-- AUTHORED, NOT APPLIED.
--
-- Makes "post one accounting period's depreciation" a SINGLE atomic,
-- idempotent, concurrency-safe operation — the same posting pattern already
-- established by create_journal_entry_with_lines (0004) and
-- apply_customer_deposit (0046): one plpgsql function = one implicit
-- Postgres transaction, so a failure partway through (a bad account id, a
-- lost connection, a concurrent conflict) leaves NOTHING committed for that
-- period, not a journal with missing depreciation_entries or an asset
-- snapshot update with no journal behind it.
--
-- SCOPE: TypeScript (depreciationService.ts) still owns every policy
-- decision — which months are open vs blocked, day-count proration, the
-- estimate-timeline lookup, the per-asset charge amounts, which account each
-- line posts to. This function does not recompute any of that; it takes the
-- already-computed lines and commits them as one indivisible accounting
-- event. "One period = one atomic command = one depreciation journal" is
-- preserved — a multi-month catch-up run calls this function once per ready
-- month, in chronological order, exactly as depreciationService already
-- does today (just replacing 1 journal-post + N entry-inserts + N asset-
-- updates with 1 RPC call per month).
--
-- IDEMPOTENCY / CONCURRENCY:
--   * `fixed_asset_period_posting_log` — UNIQUE (company_id, run_id). `run_id`
--     is a UUID the caller generates once per period-posting intent (mirrors
--     apply_customer_deposit's `allocation_id`) and can re-use on retry; a
--     retry with the same run_id returns the original result instead of
--     re-executing.
--   * `depreciation_entries` gets UNIQUE (company_id, asset_id, period_end) —
--     a hard, DB-level guarantee that one asset can never receive two
--     depreciation charges for the same accounting month, independent of
--     run_id bookkeeping (belt-and-braces: even a caller with a fresh/wrong
--     run_id cannot double-post a given asset+month; the INSERT itself
--     rejects it and the whole function — and therefore the journal it
--     already posted in the same transaction — rolls back).

-- ========================================================================
-- 1. Per-asset-per-month idempotency at the storage layer
-- ========================================================================
alter table public.depreciation_entries
  add constraint depreciation_entries_company_asset_period_key
  unique (company_id, asset_id, period_end);

-- ========================================================================
-- 2. Idempotency log — one row per period-posting call
-- ========================================================================
create table public.fixed_asset_period_posting_log (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  run_id            uuid not null,
  period_end        timestamptz not null,
  source            text not null,
  journal_entry_id  uuid references public.journal_entries(id),
  created_by        text,
  created_at        timestamptz not null default now(),
  unique (company_id, run_id)
);

create index fixed_asset_period_posting_log_company_id_idx on public.fixed_asset_period_posting_log (company_id);
create index fixed_asset_period_posting_log_journal_entry_id_idx on public.fixed_asset_period_posting_log (journal_entry_id);

alter table public.fixed_asset_period_posting_log enable row level security;

create policy fixed_asset_period_posting_log_all_own_company on public.fixed_asset_period_posting_log
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

-- ========================================================================
-- 3. The atomic executor
-- ========================================================================
-- p_lines: jsonb array of
--   { asset_id, amount, accumulated_depreciation_after, carrying_value_after,
--     new_status, gl_depreciation_expense_account_id,
--     gl_accumulated_depreciation_account_id, description }
-- — every figure already computed by depreciationService/depreciationMath.ts.
-- This function performs NO depreciation arithmetic; it validates the
-- referenced assets, posts the journal, and commits the ledger + snapshot
-- writes those figures imply.
create or replace function public.post_asset_depreciation_period(
  p_run_id     uuid,
  p_period_end timestamptz,
  p_memo       text,
  p_source     text,
  p_lines      jsonb,
  p_created_by text
) returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_company    uuid := (select public.get_my_company_id());
  v_log_id     uuid;
  v_existing   public.fixed_asset_period_posting_log;
  v_je         public.journal_entries;
  v_journal_lines jsonb := '[]'::jsonb;
  v_entries    jsonb := '[]'::jsonb;
  v_line       jsonb;
  v_asset      public.fixed_assets;
  v_entry      public.depreciation_entries;
  v_line_count int := 0;
begin
  if v_company is null then
    raise exception 'post_asset_depreciation_period: no company context';
  end if;
  if p_run_id is null then
    raise exception 'post_asset_depreciation_period: run_id is required';
  end if;

  -- 3.1 IDEMPOTENCY on the STABLE run id.
  insert into public.fixed_asset_period_posting_log (company_id, run_id, period_end, source, created_by)
  values (v_company, p_run_id, p_period_end, p_source, p_created_by)
  on conflict (company_id, run_id) do nothing
  returning id into v_log_id;

  if v_log_id is null then
    select * into v_existing from public.fixed_asset_period_posting_log
      where company_id = v_company and run_id = p_run_id;
    return jsonb_build_object(
      'idempotent', true,
      'journal_entry_id', v_existing.journal_entry_id,
      'entries', coalesce(
        (select jsonb_agg(to_jsonb(e)) from public.depreciation_entries e where e.journal_entry_id = v_existing.journal_entry_id),
        '[]'::jsonb
      ));
  end if;

  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'post_asset_depreciation_period: at least one line is required';
  end if;

  -- 3.2 open accounting period (create_journal_entry_with_lines does not check).
  if not exists (
    select 1 from public.accounting_periods p
    where p.company_id = v_company and p.status = 'open'
      and p_period_end::date between p.start_date and p.end_date
  ) then
    raise exception 'post_asset_depreciation_period: no open accounting period covers %', p_period_end::date;
  end if;

  -- 3.3 LOCK + validate every referenced asset, building the journal lines
  --     (two per asset: DR expense / CR accumulated depreciation).
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    select * into v_asset from public.fixed_assets
      where id = (v_line ->> 'asset_id')::uuid and company_id = v_company
      for update;
    if not found then
      raise exception 'post_asset_depreciation_period: asset % not found in company', v_line ->> 'asset_id';
    end if;
    if v_asset.status <> 'active' then
      raise exception 'post_asset_depreciation_period: asset % is % — depreciation can only be posted for an active asset', v_asset.asset_number, v_asset.status;
    end if;

    v_journal_lines := v_journal_lines || jsonb_build_array(
      jsonb_build_object('account_id', v_line ->> 'gl_depreciation_expense_account_id', 'description', v_line ->> 'description', 'debit', (v_line ->> 'amount')::numeric, 'credit', 0),
      jsonb_build_object('account_id', v_line ->> 'gl_accumulated_depreciation_account_id', 'description', v_line ->> 'description', 'debit', 0, 'credit', (v_line ->> 'amount')::numeric)
    );
    v_line_count := v_line_count + 1;
  end loop;

  -- 3.4 POST the balanced journal entry via the canonical atomic path.
  v_je := public.create_journal_entry_with_lines(
    v_company, '', p_period_end, p_memo, 'posted', now(), null, p_source, null, v_journal_lines
  );

  -- 3.5 depreciation_entries + fixed_assets snapshot, per asset line. The
  --     UNIQUE (company_id, asset_id, period_end) constraint added above
  --     rejects a duplicate asset+month outright — that failure rolls back
  --     the journal just posted too (same implicit transaction).
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    insert into public.depreciation_entries (
      company_id, asset_id, period_end, amount, accumulated_depreciation_after, carrying_value_after, journal_entry_id
    ) values (
      v_company, (v_line ->> 'asset_id')::uuid, p_period_end, (v_line ->> 'amount')::numeric,
      (v_line ->> 'accumulated_depreciation_after')::numeric, (v_line ->> 'carrying_value_after')::numeric, v_je.id
    ) returning * into v_entry;
    v_entries := v_entries || jsonb_build_array(to_jsonb(v_entry));

    update public.fixed_assets
       set accumulated_depreciation = (v_line ->> 'accumulated_depreciation_after')::numeric,
           status = (v_line ->> 'new_status')::public.fixed_asset_status,
           updated_at = now()
     where id = (v_line ->> 'asset_id')::uuid and company_id = v_company;
  end loop;

  update public.fixed_asset_period_posting_log set journal_entry_id = v_je.id where id = v_log_id;

  return jsonb_build_object('idempotent', false, 'journal_entry_id', v_je.id, 'entries', v_entries);
end;
$$;

revoke all on function public.post_asset_depreciation_period(uuid, timestamptz, text, text, jsonb, text) from public, anon;
grant execute on function public.post_asset_depreciation_period(uuid, timestamptz, text, text, jsonb, text) to authenticated;
