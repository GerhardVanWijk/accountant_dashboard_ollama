-- 0088_lease_commencement_rpc
-- Leases + Payroll accounting-integrity hardening (PART 1 — atomic lease
-- commencement). AUTHORED, NOT APPLIED.
--
-- Makes "commence a draft lease" a SINGLE atomic, idempotent,
-- concurrency-safe operation — the same posting pattern already
-- established by `apply_customer_deposit` (0046) and
-- `post_fixed_asset_disposal` (0083). Before this migration,
-- `LeaseService.postCommencement()` made 2 separate, independently-
-- committing writes (post the capitalization journal, then update
-- `lease_contracts` to status='active'/outstandingLeaseLiability/
-- journalEntryId) — a failure between them leaves a posted GL journal
-- capitalizing a Right-of-Use asset with NO lease row reflecting it (the
-- lease still shows 'draft', outstandingLeaseLiability still 0), and a
-- retry would post a SECOND capitalization journal since the "already
-- commenced" guard reads the never-updated draft status — silently
-- doubling the ROU asset and lease liability on the books.
--
-- SCOPE: TypeScript (leaseService.ts) still owns every policy decision and
-- calculation — the present-value liability computed once at
-- `createLease()` time (`calculateLeaseLiabilityPresentValue`), which line
-- accounts to post to. This function performs NO present-value arithmetic;
-- it takes the lease's own already-computed `initial_lease_liability` and
-- either commits the whole commencement event or rolls all of it back.
--
-- IDEMPOTENCY / CONCURRENCY:
--   * `lease_commencement_log` — UNIQUE (company_id, commencement_id).
--     `commencement_id` is a UUID the caller generates once per "commence
--     this lease" intent (src/lib/uuid.ts's newUuid(), same convention as
--     `apply_customer_deposit`'s allocation_id / `post_fixed_asset_disposal`'s
--     disposal_id) and re-uses on retry.
--   * The function LOCKS the `lease_contracts` row FOR UPDATE and
--     re-validates its status against the LOCKED row (mirrors
--     `post_fixed_asset_disposal`'s asset re-validation) — two concurrent
--     commencement calls for the same lease serialise on that lock; the
--     second sees status <> 'draft' and fails cleanly instead of
--     double-capitalizing. `lease_contracts.status` itself is the
--     structural backstop (a lease can only ever transition draft ->
--     active once), independent of commencement_id bookkeeping — same
--     "belt and braces" convention as 0083's asset_disposals unique
--     constraint.

create table public.lease_commencement_log (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  commencement_id   uuid not null,
  lease_id          uuid not null,
  journal_entry_id  uuid references public.journal_entries(id),
  created_by        text,
  created_at        timestamptz not null default now(),
  unique (company_id, commencement_id)
);

create index lease_commencement_log_company_id_idx on public.lease_commencement_log (company_id);
create index lease_commencement_log_lease_id_idx on public.lease_commencement_log (lease_id);

alter table public.lease_commencement_log enable row level security;

create policy lease_commencement_log_all_own_company on public.lease_commencement_log
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

-- ========================================================================
-- The atomic executor
-- ========================================================================
create or replace function public.post_lease_commencement(
  p_commencement_id  uuid,
  p_lease_id         uuid,
  p_commencement_date timestamptz,
  p_memo             text,
  p_source           text,
  p_right_of_use_asset_account_id uuid,
  p_lease_liability_account_id    uuid,
  p_created_by       text
) returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_company   uuid := (select public.get_my_company_id());
  v_log_id    uuid;
  v_existing  public.lease_commencement_log;
  v_lease     public.lease_contracts;
  v_je        public.journal_entries;
  v_amount    numeric(14, 2);
begin
  if v_company is null then
    raise exception 'post_lease_commencement: no company context';
  end if;
  if p_commencement_id is null then
    raise exception 'post_lease_commencement: commencement_id is required';
  end if;

  -- IDEMPOTENCY on the STABLE commencement id.
  insert into public.lease_commencement_log (company_id, commencement_id, lease_id, created_by)
  values (v_company, p_commencement_id, p_lease_id, p_created_by)
  on conflict (company_id, commencement_id) do nothing
  returning id into v_log_id;

  if v_log_id is null then
    select * into v_existing from public.lease_commencement_log
      where company_id = v_company and commencement_id = p_commencement_id;
    select * into v_lease from public.lease_contracts where id = v_existing.lease_id and company_id = v_company;
    return jsonb_build_object(
      'idempotent', true,
      'journal_entry_id', v_existing.journal_entry_id,
      'lease', to_jsonb(v_lease));
  end if;

  -- LOCK the lease — serialises a concurrent commencement attempt on the same lease.
  select * into v_lease from public.lease_contracts
    where id = p_lease_id and company_id = v_company
    for update;
  if not found then
    raise exception 'post_lease_commencement: lease % not found in company', p_lease_id;
  end if;

  -- RE-VALIDATE against the LOCKED row.
  if v_lease.status <> 'draft' then
    raise exception 'post_lease_commencement: lease % has already commenced (status: %)', v_lease.lease_number, v_lease.status;
  end if;

  -- open accounting period (create_journal_entry_with_lines does not check).
  if not exists (
    select 1 from public.accounting_periods p
    where p.company_id = v_company and p.status = 'open'
      and p_commencement_date::date between p.start_date and p.end_date
  ) then
    raise exception 'post_lease_commencement: no open accounting period covers %', p_commencement_date::date;
  end if;

  v_amount := v_lease.initial_lease_liability;

  -- POST the balanced commencement journal via the canonical atomic path.
  v_je := public.create_journal_entry_with_lines(
    v_company, '', p_commencement_date, p_memo, 'posted', now(), null, p_source, null,
    jsonb_build_array(
      jsonb_build_object('account_id', p_right_of_use_asset_account_id, 'description', p_memo, 'debit', v_amount, 'credit', 0),
      jsonb_build_object('account_id', p_lease_liability_account_id, 'description', p_memo, 'debit', 0, 'credit', v_amount)
    )
  );

  update public.lease_contracts
     set status = 'active',
         outstanding_lease_liability = v_amount,
         journal_entry_id = v_je.id,
         updated_at = now()
   where id = p_lease_id and company_id = v_company
   returning * into v_lease;

  update public.lease_commencement_log set journal_entry_id = v_je.id where id = v_log_id;

  return jsonb_build_object('idempotent', false, 'journal_entry_id', v_je.id, 'lease', to_jsonb(v_lease));
end;
$$;

revoke all on function public.post_lease_commencement(
  uuid, uuid, timestamptz, text, text, uuid, uuid, text
) from public, anon;
grant execute on function public.post_lease_commencement(
  uuid, uuid, timestamptz, text, text, uuid, uuid, text
) to authenticated;
