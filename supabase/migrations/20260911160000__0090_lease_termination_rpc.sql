-- 0090_lease_termination_rpc
-- Leases + Payroll accounting-integrity hardening (PART 1 — atomic lease
-- termination). AUTHORED, NOT APPLIED.
--
-- Makes "terminate a lease" a SINGLE atomic, idempotent, concurrency-safe
-- operation — same pattern as `post_fixed_asset_disposal` (0083), whose
-- gain/loss shape `LeaseDisposalService.terminateLease()` already mirrors
-- line for line. Before this migration, `terminateLease()` made 2 separate,
-- independently-committing writes (post the termination journal, then
-- update `lease_contracts` to status='terminated'/terminationDate/
-- terminationJournalEntryId) — a failure between them leaves a posted GL
-- journal that derecognized the ROU asset and cleared the lease liability
-- with NO lease row reflecting it (still shows 'active', liability/
-- depreciation unchanged), and a retry would post a SECOND termination
-- journal since the "already terminated" guard reads the never-updated
-- status — silently derecognizing the same lease twice.
--
-- SCOPE: TypeScript (leaseDisposalService.ts) still owns every policy
-- decision and calculation — the ROU carrying value, the gain/loss on
-- termination, which journal lines to post. This function performs NO
-- gain/loss arithmetic; it takes the already-computed lines and either
-- commits the whole termination event or rolls all of it back.
--
-- IDEMPOTENCY / CONCURRENCY:
--   * `lease_termination_log` — UNIQUE (company_id, termination_id).
--     `termination_id` is a UUID the caller generates once per "terminate
--     this lease" intent (same convention as 0083's disposal_id / 0088's
--     commencement_id) and re-uses on retry.
--   * The function LOCKS the `lease_contracts` row FOR UPDATE and
--     re-validates its status against the LOCKED row (mirrors
--     `post_fixed_asset_disposal`) — two concurrent termination calls for
--     the same lease serialise on that lock; the second sees status =
--     'terminated' (or status = 'draft', either way rejected) and fails
--     cleanly instead of double-terminating. `lease_contracts.status`
--     itself is the structural backstop, independent of termination_id
--     bookkeeping.

create table public.lease_termination_log (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  termination_id    uuid not null,
  lease_id          uuid not null,
  journal_entry_id  uuid references public.journal_entries(id),
  created_by        text,
  created_at        timestamptz not null default now(),
  unique (company_id, termination_id)
);

create index lease_termination_log_company_id_idx on public.lease_termination_log (company_id);
create index lease_termination_log_lease_id_idx on public.lease_termination_log (lease_id);

alter table public.lease_termination_log enable row level security;

create policy lease_termination_log_all_own_company on public.lease_termination_log
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

-- ========================================================================
-- The atomic executor
-- ========================================================================
-- p_lines: the termination journal's already-computed lines (remove ROU
--   cost, clear accumulated depreciation, clear remaining liability, the
--   balancing gain/loss).
create or replace function public.post_lease_termination(
  p_termination_id   uuid,
  p_lease_id         uuid,
  p_termination_date timestamptz,
  p_memo             text,
  p_source           text,
  p_lines            jsonb,
  p_created_by       text
) returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_company   uuid := (select public.get_my_company_id());
  v_log_id    uuid;
  v_existing  public.lease_termination_log;
  v_lease     public.lease_contracts;
  v_je        public.journal_entries;
  v_total_debit  numeric;
  v_total_credit numeric;
begin
  if v_company is null then
    raise exception 'post_lease_termination: no company context';
  end if;
  if p_termination_id is null then
    raise exception 'post_lease_termination: termination_id is required';
  end if;

  -- IDEMPOTENCY on the STABLE termination id.
  insert into public.lease_termination_log (company_id, termination_id, lease_id, created_by)
  values (v_company, p_termination_id, p_lease_id, p_created_by)
  on conflict (company_id, termination_id) do nothing
  returning id into v_log_id;

  if v_log_id is null then
    select * into v_existing from public.lease_termination_log
      where company_id = v_company and termination_id = p_termination_id;
    select * into v_lease from public.lease_contracts where id = v_existing.lease_id and company_id = v_company;
    return jsonb_build_object(
      'idempotent', true,
      'journal_entry_id', v_existing.journal_entry_id,
      'lease', to_jsonb(v_lease));
  end if;

  -- LOCK the lease — serialises a concurrent termination attempt on the same lease.
  select * into v_lease from public.lease_contracts
    where id = p_lease_id and company_id = v_company
    for update;
  if not found then
    raise exception 'post_lease_termination: lease % not found in company', p_lease_id;
  end if;

  -- RE-VALIDATE against the LOCKED row.
  if v_lease.status = 'draft' then
    raise exception 'post_lease_termination: lease % has not commenced yet (still a draft)', v_lease.lease_number;
  end if;
  if v_lease.status = 'terminated' then
    raise exception 'post_lease_termination: lease % has already been terminated', v_lease.lease_number;
  end if;

  -- open accounting period (create_journal_entry_with_lines does not check).
  if not exists (
    select 1 from public.accounting_periods p
    where p.company_id = v_company and p.status = 'open'
      and p_termination_date::date between p.start_date and p.end_date
  ) then
    raise exception 'post_lease_termination: no open accounting period covers %', p_termination_date::date;
  end if;

  -- JOURNAL BALANCING: create_journal_entry_with_lines() trusts p_lines as
  -- given (confirmed against the live function definition — no balance
  -- check of its own). Unlike commencement's fixed 2-line shape, a
  -- termination's lines (ROU cost removal, accumulated depreciation
  -- clearing, liability clearing, gain/loss) are dynamically built in
  -- TypeScript, so this function re-verifies the sum itself rather than
  -- inheriting that trust silently.
  select coalesce(sum((l ->> 'debit')::numeric), 0), coalesce(sum((l ->> 'credit')::numeric), 0)
    into v_total_debit, v_total_credit
    from jsonb_array_elements(p_lines) l;
  if abs(v_total_debit - v_total_credit) > 0.01 then
    raise exception 'post_lease_termination: lines do not balance (debit % vs credit %)', v_total_debit, v_total_credit;
  end if;

  -- POST the balanced termination journal via the canonical atomic path.
  v_je := public.create_journal_entry_with_lines(
    v_company, '', p_termination_date, p_memo, 'posted', now(), null, p_source, null, p_lines
  );

  update public.lease_contracts
     set status = 'terminated',
         termination_date = p_termination_date,
         termination_journal_entry_id = v_je.id,
         updated_at = now()
   where id = p_lease_id and company_id = v_company
   returning * into v_lease;

  update public.lease_termination_log set journal_entry_id = v_je.id where id = v_log_id;

  return jsonb_build_object('idempotent', false, 'journal_entry_id', v_je.id, 'lease', to_jsonb(v_lease));
end;
$$;

revoke all on function public.post_lease_termination(
  uuid, uuid, timestamptz, text, text, jsonb, text
) from public, anon;
grant execute on function public.post_lease_termination(
  uuid, uuid, timestamptz, text, text, jsonb, text
) to authenticated;
