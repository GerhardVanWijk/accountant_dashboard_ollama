-- 0104_ecl_atomic_posting
-- Tax & Compliance integrity audit, continuation (2026-09-12). AUTHORED, NOT APPLIED.
-- Apply AFTER 0007 (ecl_computations) and 0033 (create_journal_entry_with_lines).
--
-- Same defect class as 0099 (Income Tax) / 0103 (Deferred Tax):
-- `EclComputationService.postComputation()` posted the movement journal
-- (DR Impairment Loss / CR Allowance for Doubtful Debts, or the reverse for
-- a decrease), then SEPARATELY updated `ecl_computations` (status,
-- journal_entry_id, movement_amount, prior_total_expected_credit_loss) —
-- two independently-committing writes. A failure between them leaves a
-- real posted GL movement with the computation still showing 'draft', and
-- a retry posts a SECOND movement journal, double-counting the period's
-- impairment expense / allowance change.
--
-- SCOPE: TypeScript (eclComputationService.ts) still owns the ENTIRE IFRS 9
-- simplified trade-receivables provision-matrix model — ageing buckets
-- from the real Customer Aging Report, loss rates (always a manual input,
-- never guessed), the movement-since-prior-posted-computation
-- calculation. This function performs NO ECL arithmetic; it takes the
-- already-computed movement/lines and either commits the whole posting
-- event or rolls all of it back. Posting ECL never writes off a
-- receivable and never touches `invoices`/`invoice_lines` — it only ever
-- moves the Impairment Loss / Allowance for Doubtful Debts accounts, an
-- allowance against receivables, not the receivables themselves.
--
-- IDEMPOTENCY / CONCURRENCY: mirrors 0103 exactly — an ECL computation
-- posts at most once, ever (createComputation()'s per-financial-year
-- guard is the structural backstop), so the idempotency key is the
-- computation's own stable id.

create table public.ecl_computation_posting_log (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,
  ecl_computation_id    uuid not null,
  journal_entry_id      uuid references public.journal_entries(id),
  created_by            text,
  created_at            timestamptz not null default now(),
  unique (company_id, ecl_computation_id)
);

create index ecl_computation_posting_log_company_id_idx
  on public.ecl_computation_posting_log (company_id);

alter table public.ecl_computation_posting_log enable row level security;

create policy ecl_computation_posting_log_all_own_company
  on public.ecl_computation_posting_log for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

create or replace function public.post_ecl_computation(
  p_ecl_computation_id                 uuid,
  p_date                                timestamptz,
  p_memo                                text,
  p_source                              text,
  p_lines                               jsonb,
  p_movement_amount                     numeric,
  p_prior_total_expected_credit_loss    numeric,
  p_posted_by                           text
) returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_company       uuid := (select public.get_my_company_id());
  v_log_id        uuid;
  v_existing      public.ecl_computation_posting_log;
  v_computation   public.ecl_computations;
  v_je            public.journal_entries;
  v_total_debit   numeric;
  v_total_credit  numeric;
begin
  if v_company is null then
    raise exception 'post_ecl_computation: no company context';
  end if;
  if not public.has_permission('tax', 'post') then
    raise exception 'post_ecl_computation: missing required permission tax:post' using errcode = '42501';
  end if;
  if p_ecl_computation_id is null then
    raise exception 'post_ecl_computation: ecl_computation_id is required';
  end if;

  insert into public.ecl_computation_posting_log (company_id, ecl_computation_id, created_by)
  values (v_company, p_ecl_computation_id, p_posted_by)
  on conflict (company_id, ecl_computation_id) do nothing
  returning id into v_log_id;

  if v_log_id is null then
    select * into v_existing from public.ecl_computation_posting_log
      where company_id = v_company and ecl_computation_id = p_ecl_computation_id;
    select * into v_computation from public.ecl_computations
      where id = p_ecl_computation_id and company_id = v_company;
    return jsonb_build_object(
      'idempotent', true,
      'journal_entry_id', v_existing.journal_entry_id,
      'computation', to_jsonb(v_computation));
  end if;

  select * into v_computation from public.ecl_computations
    where id = p_ecl_computation_id and company_id = v_company
    for update;
  if not found then
    raise exception 'post_ecl_computation: expected credit loss computation % not found in company', p_ecl_computation_id;
  end if;

  if v_computation.status <> 'draft' then
    raise exception 'post_ecl_computation: expected credit loss computation for "%" has already been posted', v_computation.financial_year_label;
  end if;

  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    -- No real movement (first-ever computation with zero receivables, or a re-measurement netting to nothing) — just flip status.
    update public.ecl_computations
       set status = 'posted',
           prior_total_expected_credit_loss = p_prior_total_expected_credit_loss,
           movement_amount = 0,
           posted_at = now(),
           posted_by_user_id = p_posted_by,
           updated_at = now()
     where id = p_ecl_computation_id and company_id = v_company
     returning * into v_computation;

    update public.ecl_computation_posting_log set journal_entry_id = null where id = v_log_id;
    return jsonb_build_object('idempotent', false, 'journal_entry_id', null, 'computation', to_jsonb(v_computation));
  end if;

  if not exists (
    select 1 from public.accounting_periods p
    where p.company_id = v_company and p.status = 'open'
      and p_date::date between p.start_date and p.end_date
  ) then
    raise exception 'post_ecl_computation: no open accounting period covers %', p_date::date;
  end if;

  select coalesce(sum((l ->> 'debit')::numeric), 0), coalesce(sum((l ->> 'credit')::numeric), 0)
    into v_total_debit, v_total_credit
    from jsonb_array_elements(p_lines) l;
  if abs(v_total_debit - v_total_credit) > 0.01 then
    raise exception 'post_ecl_computation: lines do not balance (debit % vs credit %)', v_total_debit, v_total_credit;
  end if;

  v_je := public.create_journal_entry_with_lines(
    v_company, '', p_date, p_memo, 'posted', now(), null, p_source, null, p_lines
  );

  update public.ecl_computations
     set status = 'posted',
         journal_entry_id = v_je.id,
         prior_total_expected_credit_loss = p_prior_total_expected_credit_loss,
         movement_amount = p_movement_amount,
         posted_at = now(),
         posted_by_user_id = p_posted_by,
         updated_at = now()
   where id = p_ecl_computation_id and company_id = v_company
   returning * into v_computation;

  update public.ecl_computation_posting_log set journal_entry_id = v_je.id where id = v_log_id;

  return jsonb_build_object('idempotent', false, 'journal_entry_id', v_je.id, 'computation', to_jsonb(v_computation));
end;
$$;

revoke all on function public.post_ecl_computation(
  uuid, timestamptz, text, text, jsonb, numeric, numeric, text
) from public, anon;
grant execute on function public.post_ecl_computation(
  uuid, timestamptz, text, text, jsonb, numeric, numeric, text
) to authenticated;
