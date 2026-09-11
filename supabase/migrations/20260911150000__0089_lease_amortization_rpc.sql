-- 0089_lease_amortization_rpc
-- Leases + Payroll accounting-integrity hardening (PART 1 — atomic lease
-- amortization + PART 3 — Banking/payment architecture). AUTHORED, NOT
-- APPLIED. Apply AFTER 0085 (this function posts to the 2460 Lease Payment
-- Clearing account it seeds).
--
-- Makes "run one period's lease amortization across every eligible lease" a
-- SINGLE atomic, idempotent, concurrency-safe operation — same pattern as
-- `post_asset_depreciation_period` (0081), applied to leases' combined-
-- entry-per-run shape. Before this migration,
-- `LeaseAmortizationService.runAmortization()` made 1 + 2N separate,
-- independently-committing writes (post one combined journal, then per
-- lease: update `lease_contracts`' running balances, insert a
-- `lease_amortization_entries` row) — a failure partway through leaves the
-- combined journal posted but only SOME leases' liability/accumulated-
-- depreciation snapshots updated, with no way to tell which from the
-- journal alone, and a retry would re-post the whole combined journal a
-- second time (the per-lease "already amortized this period" guard reads
-- `lease_amortization_entries`, which the failed leases never got a row
-- in).
--
-- BANKING FIX (PART 3): the payment leg of this journal no longer credits
-- Cash and Bank directly. `p_lease_payment_clearing_account_id` MUST
-- resolve to a liability-type account (checked below) — in practice always
-- 2460 Lease Payment Clearing (0085) — never Cash and Bank itself. The
-- actual cash movement is recorded exactly once, later, when the real
-- debit order is captured/matched through the existing Banking module
-- against this same clearing account (subledgerSettlementService.ts,
-- writing `bank_transactions.matched_entity_type = 'lease_contract'`, see
-- 0086). Posting straight to Cash here would let the same disbursement be
-- counted twice — once by this run, once when the bank statement is
-- imported/allocated.
--
-- SCOPE: TypeScript (leaseAmortizationService.ts) still owns every policy
-- decision and calculation — which leases are eligible, the interest/
-- principal split (calculateMonthlyAmortization), the ROU depreciation
-- charge, the debit-vector aggregation across leases. This function
-- performs NO amortization arithmetic; it takes the already-computed
-- per-lease lines and commits them as one indivisible accounting event.
--
-- IDEMPOTENCY / CONCURRENCY:
--   * `lease_amortization_posting_log` — UNIQUE (company_id, run_id).
--     `run_id` is a UUID the caller generates once per period-posting
--     intent (mirrors 0081's fixed_asset_period_posting_log exactly) and
--     re-uses on retry.
--   * `lease_amortization_entries` gets UNIQUE (company_id, lease_id,
--     period_end) — a hard, DB-level guarantee that one lease can never
--     receive two amortization charges for the same accounting month,
--     independent of run_id bookkeeping (belt-and-braces, mirrors 0081's
--     identical constraint on depreciation_entries exactly).
--   * Every referenced lease is LOCKED FOR UPDATE before its snapshot is
--     read/written, serialising a concurrent run against the same lease.

-- ========================================================================
-- 1. Per-lease-per-month idempotency at the storage layer
-- ========================================================================
alter table public.lease_amortization_entries
  add constraint lease_amortization_entries_company_lease_period_key
  unique (company_id, lease_id, period_end);

-- ========================================================================
-- 2. Idempotency log — one row per period-posting call
-- ========================================================================
create table public.lease_amortization_posting_log (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  run_id            uuid not null,
  period_end        date not null,
  source            text not null,
  journal_entry_id  uuid references public.journal_entries(id),
  created_by        text,
  created_at        timestamptz not null default now(),
  unique (company_id, run_id)
);

create index lease_amortization_posting_log_company_id_idx on public.lease_amortization_posting_log (company_id);
create index lease_amortization_posting_log_journal_entry_id_idx on public.lease_amortization_posting_log (journal_entry_id);

alter table public.lease_amortization_posting_log enable row level security;

create policy lease_amortization_posting_log_all_own_company on public.lease_amortization_posting_log
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

-- ========================================================================
-- 3. The atomic executor
-- ========================================================================
-- p_lines: jsonb array of
--   { lease_id, interest, principal, depreciation,
--     outstanding_lease_liability_after, accumulated_depreciation_after }
--   — every figure already computed by leaseAmortizationService.ts.
-- p_journal_lines: the already-aggregated debit-vector journal lines
--   (interest expense / lease liability / lease payment clearing /
--   depreciation expense / accumulated depreciation, netted across every
--   eligible lease) — computed in TypeScript exactly as today, just no
--   longer posted independently of the per-lease writes below.
create or replace function public.post_lease_amortization_period(
  p_run_id                          uuid,
  p_period_end                      date,
  p_memo                            text,
  p_source                          text,
  p_lines                           jsonb,
  p_journal_lines                   jsonb,
  p_lease_payment_clearing_account_id uuid,
  p_created_by                      text
) returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_company     uuid := (select public.get_my_company_id());
  v_log_id      uuid;
  v_existing    public.lease_amortization_posting_log;
  v_je          public.journal_entries;
  v_line        jsonb;
  v_lease       public.lease_contracts;
  v_entry       public.lease_amortization_entries;
  v_entries     jsonb := '[]'::jsonb;
  v_clearing    public.accounts;
  v_total_debit  numeric;
  v_total_credit numeric;
begin
  if v_company is null then
    raise exception 'post_lease_amortization_period: no company context';
  end if;
  if p_run_id is null then
    raise exception 'post_lease_amortization_period: run_id is required';
  end if;

  -- IDEMPOTENCY on the STABLE run id.
  insert into public.lease_amortization_posting_log (company_id, run_id, period_end, source, created_by)
  values (v_company, p_run_id, p_period_end, p_source, p_created_by)
  on conflict (company_id, run_id) do nothing
  returning id into v_log_id;

  if v_log_id is null then
    select * into v_existing from public.lease_amortization_posting_log
      where company_id = v_company and run_id = p_run_id;
    return jsonb_build_object(
      'idempotent', true,
      'journal_entry_id', v_existing.journal_entry_id,
      'entries', coalesce(
        (select jsonb_agg(to_jsonb(e)) from public.lease_amortization_entries e where e.journal_entry_id = v_existing.journal_entry_id),
        '[]'::jsonb
      ));
  end if;

  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'post_lease_amortization_period: at least one line is required';
  end if;

  -- BANKING FIX: the clearing account must be a liability, never Cash and
  -- Bank or any asset account — refuses to let a caller silently smuggle a
  -- direct-to-cash posting back in through this parameter.
  select * into v_clearing from public.accounts where id = p_lease_payment_clearing_account_id and company_id = v_company;
  if not found then
    raise exception 'post_lease_amortization_period: lease payment clearing account % not found in company', p_lease_payment_clearing_account_id;
  end if;
  if v_clearing.type <> 'liability' then
    raise exception 'post_lease_amortization_period: lease payment clearing account "%" (%) must be a liability/clearing account, not %. The lease payment is settled later through Banking — this run must never credit Cash and Bank directly.', v_clearing.name, v_clearing.code, v_clearing.type;
  end if;

  -- open accounting period (create_journal_entry_with_lines does not check).
  if not exists (
    select 1 from public.accounting_periods p
    where p.company_id = v_company and p.status = 'open'
      and p_period_end between p.start_date and p.end_date
  ) then
    raise exception 'post_lease_amortization_period: no open accounting period covers %', p_period_end;
  end if;

  -- JOURNAL BALANCING: create_journal_entry_with_lines() has no balance
  -- check of its own (confirmed against the live function definition) — it
  -- trusts whatever p_journal_lines it is given. p_journal_lines here is a
  -- TypeScript-aggregated debit-vector, not "balanced by construction" the
  -- way a simple 2-line entry is, so this function re-verifies it itself
  -- before posting rather than inheriting that trust silently. Same 0.01
  -- tolerance as journalEntryService.ts's own BALANCE_EPSILON (rounding,
  -- not a real imbalance).
  select coalesce(sum((l ->> 'debit')::numeric), 0), coalesce(sum((l ->> 'credit')::numeric), 0)
    into v_total_debit, v_total_credit
    from jsonb_array_elements(p_journal_lines) l;
  if abs(v_total_debit - v_total_credit) > 0.01 then
    raise exception 'post_lease_amortization_period: journal_lines do not balance (debit % vs credit %)', v_total_debit, v_total_credit;
  end if;

  -- LOCK every referenced lease up front (deterministic order = sorted by
  -- id, avoids a lock-order deadlock against a concurrent single-lease
  -- operation touching the same leases in a different order).
  perform 1 from public.lease_contracts
    where company_id = v_company
      and id in (select (l ->> 'lease_id')::uuid from jsonb_array_elements(p_lines) l)
    order by id
    for update;

  -- POST the balanced combined journal via the canonical atomic path.
  v_je := public.create_journal_entry_with_lines(
    v_company, '', p_period_end, p_memo, 'posted', now(), null, p_source, null, p_journal_lines
  );

  -- Per-lease entries + lease_contracts snapshot. The UNIQUE (company_id,
  -- lease_id, period_end) constraint added above rejects a duplicate
  -- lease+month outright — that failure rolls back the journal just
  -- posted too (same implicit transaction).
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    select * into v_lease from public.lease_contracts
      where id = (v_line ->> 'lease_id')::uuid and company_id = v_company;
    if not found then
      raise exception 'post_lease_amortization_period: lease % not found in company', v_line ->> 'lease_id';
    end if;
    if v_lease.status <> 'active' then
      raise exception 'post_lease_amortization_period: lease % is % — amortization can only be posted for an active lease', v_lease.lease_number, v_lease.status;
    end if;

    insert into public.lease_amortization_entries (
      company_id, lease_id, period_end, interest_amount, principal_amount, depreciation_amount,
      outstanding_lease_liability_after, accumulated_depreciation_after, journal_entry_id
    ) values (
      v_company, (v_line ->> 'lease_id')::uuid, p_period_end, (v_line ->> 'interest')::numeric,
      (v_line ->> 'principal')::numeric, (v_line ->> 'depreciation')::numeric,
      (v_line ->> 'outstanding_lease_liability_after')::numeric, (v_line ->> 'accumulated_depreciation_after')::numeric, v_je.id
    ) returning * into v_entry;
    v_entries := v_entries || jsonb_build_array(to_jsonb(v_entry));

    update public.lease_contracts
       set outstanding_lease_liability = (v_line ->> 'outstanding_lease_liability_after')::numeric,
           accumulated_depreciation = (v_line ->> 'accumulated_depreciation_after')::numeric,
           updated_at = now()
     where id = (v_line ->> 'lease_id')::uuid and company_id = v_company;
  end loop;

  update public.lease_amortization_posting_log set journal_entry_id = v_je.id where id = v_log_id;

  return jsonb_build_object('idempotent', false, 'journal_entry_id', v_je.id, 'entries', v_entries);
end;
$$;

revoke all on function public.post_lease_amortization_period(
  uuid, date, text, text, jsonb, jsonb, uuid, text
) from public, anon;
grant execute on function public.post_lease_amortization_period(
  uuid, date, text, text, jsonb, jsonb, uuid, text
) to authenticated;
