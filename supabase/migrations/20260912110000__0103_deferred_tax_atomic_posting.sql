-- 0103_deferred_tax_atomic_posting
-- Tax & Compliance integrity audit, continuation (2026-09-12). AUTHORED, NOT APPLIED.
-- Apply AFTER 0007 (deferred_tax_computations) and 0033 (create_journal_entry_with_lines).
--
-- Same defect class as 0099 (Income Tax) / 0101 (Provisional Tax) / 0102
-- (Dividends Tax): `DeferredTaxComputationService.postComputation()` posted
-- the movement journal, then SEPARATELY updated `deferred_tax_computations`
-- (status, journal_entry_id, movement_amount,
-- prior_net_deferred_tax_liability) — two independently-committing writes.
-- A failure between them leaves a real posted GL movement with the
-- computation still showing 'draft', and a retry posts a SECOND movement
-- journal, double-counting the period's Deferred Tax Expense/DTA/DTL
-- change.
--
-- SCOPE: TypeScript (deferredTaxComputationService.ts) still owns the
-- ENTIRE IAS 12 model — every temporary difference, the movement-since-
-- prior-posted-computation calculation, which accounts move and by how
-- much. This function performs NO deferred-tax arithmetic; it takes the
-- already-computed movement/lines and either commits the whole posting
-- event or rolls all of it back. Deferred tax is explicitly NOT
-- `accountingProfit x taxRate` here or anywhere in this codebase — this
-- migration does not change that model, only how atomically it posts.
--
-- IDEMPOTENCY / CONCURRENCY: mirrors 0099 exactly — a deferred tax
-- computation posts at most once, ever (createComputation()'s
-- per-financial-year guard is the structural backstop), so the
-- idempotency key is the computation's own stable id.

create table public.deferred_tax_computation_posting_log (
  id                            uuid primary key default gen_random_uuid(),
  company_id                    uuid not null references public.companies(id) on delete cascade,
  deferred_tax_computation_id   uuid not null,
  journal_entry_id              uuid references public.journal_entries(id),
  created_by                    text,
  created_at                    timestamptz not null default now(),
  unique (company_id, deferred_tax_computation_id)
);

create index deferred_tax_computation_posting_log_company_id_idx
  on public.deferred_tax_computation_posting_log (company_id);

alter table public.deferred_tax_computation_posting_log enable row level security;

create policy deferred_tax_computation_posting_log_all_own_company
  on public.deferred_tax_computation_posting_log for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

create or replace function public.post_deferred_tax_computation(
  p_deferred_tax_computation_id uuid,
  p_date                        timestamptz,
  p_memo                        text,
  p_source                      text,
  p_lines                       jsonb,
  p_movement_amount             numeric,
  p_prior_net_deferred_tax_liability numeric,
  p_posted_by                   text
) returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_company       uuid := (select public.get_my_company_id());
  v_log_id        uuid;
  v_existing      public.deferred_tax_computation_posting_log;
  v_computation   public.deferred_tax_computations;
  v_je            public.journal_entries;
  v_total_debit   numeric;
  v_total_credit  numeric;
begin
  if v_company is null then
    raise exception 'post_deferred_tax_computation: no company context';
  end if;
  if not public.has_permission('tax', 'post') then
    raise exception 'post_deferred_tax_computation: missing required permission tax:post' using errcode = '42501';
  end if;
  if p_deferred_tax_computation_id is null then
    raise exception 'post_deferred_tax_computation: deferred_tax_computation_id is required';
  end if;

  insert into public.deferred_tax_computation_posting_log (company_id, deferred_tax_computation_id, created_by)
  values (v_company, p_deferred_tax_computation_id, p_posted_by)
  on conflict (company_id, deferred_tax_computation_id) do nothing
  returning id into v_log_id;

  if v_log_id is null then
    select * into v_existing from public.deferred_tax_computation_posting_log
      where company_id = v_company and deferred_tax_computation_id = p_deferred_tax_computation_id;
    select * into v_computation from public.deferred_tax_computations
      where id = p_deferred_tax_computation_id and company_id = v_company;
    return jsonb_build_object(
      'idempotent', true,
      'journal_entry_id', v_existing.journal_entry_id,
      'computation', to_jsonb(v_computation));
  end if;

  select * into v_computation from public.deferred_tax_computations
    where id = p_deferred_tax_computation_id and company_id = v_company
    for update;
  if not found then
    raise exception 'post_deferred_tax_computation: deferred tax computation % not found in company', p_deferred_tax_computation_id;
  end if;

  if v_computation.status <> 'draft' then
    raise exception 'post_deferred_tax_computation: deferred tax computation for "%" has already been posted', v_computation.financial_year_label;
  end if;

  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    -- No real movement (first-ever computation with zero temporary differences, or a re-measurement netting to nothing) — just flip status.
    update public.deferred_tax_computations
       set status = 'posted',
           prior_net_deferred_tax_liability = p_prior_net_deferred_tax_liability,
           movement_amount = 0,
           posted_at = now(),
           posted_by_user_id = p_posted_by,
           updated_at = now()
     where id = p_deferred_tax_computation_id and company_id = v_company
     returning * into v_computation;

    update public.deferred_tax_computation_posting_log set journal_entry_id = null where id = v_log_id;
    return jsonb_build_object('idempotent', false, 'journal_entry_id', null, 'computation', to_jsonb(v_computation));
  end if;

  if not exists (
    select 1 from public.accounting_periods p
    where p.company_id = v_company and p.status = 'open'
      and p_date::date between p.start_date and p.end_date
  ) then
    raise exception 'post_deferred_tax_computation: no open accounting period covers %', p_date::date;
  end if;

  select coalesce(sum((l ->> 'debit')::numeric), 0), coalesce(sum((l ->> 'credit')::numeric), 0)
    into v_total_debit, v_total_credit
    from jsonb_array_elements(p_lines) l;
  if abs(v_total_debit - v_total_credit) > 0.01 then
    raise exception 'post_deferred_tax_computation: lines do not balance (debit % vs credit %)', v_total_debit, v_total_credit;
  end if;

  v_je := public.create_journal_entry_with_lines(
    v_company, '', p_date, p_memo, 'posted', now(), null, p_source, null, p_lines
  );

  update public.deferred_tax_computations
     set status = 'posted',
         journal_entry_id = v_je.id,
         prior_net_deferred_tax_liability = p_prior_net_deferred_tax_liability,
         movement_amount = p_movement_amount,
         posted_at = now(),
         posted_by_user_id = p_posted_by,
         updated_at = now()
   where id = p_deferred_tax_computation_id and company_id = v_company
   returning * into v_computation;

  update public.deferred_tax_computation_posting_log set journal_entry_id = v_je.id where id = v_log_id;

  return jsonb_build_object('idempotent', false, 'journal_entry_id', v_je.id, 'computation', to_jsonb(v_computation));
end;
$$;

revoke all on function public.post_deferred_tax_computation(
  uuid, timestamptz, text, text, jsonb, numeric, numeric, text
) from public, anon;
grant execute on function public.post_deferred_tax_computation(
  uuid, timestamptz, text, text, jsonb, numeric, numeric, text
) to authenticated;
