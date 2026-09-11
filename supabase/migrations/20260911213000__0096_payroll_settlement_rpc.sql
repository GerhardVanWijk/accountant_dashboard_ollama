-- 0096_payroll_settlement_rpc
-- Leases + Payroll integrity hardening — FINAL PRE-MIGRATION HARDENING,
-- PART A (database-level clearing over-settlement protection). AUTHORED,
-- NOT APPLIED. Apply AFTER 0091 (payroll_runs.contra_account_id/
-- journal_entry_id/reversed_at) and 0095 (subledger_settlements).
--
-- Makes "settle (part of) a posted payroll run's Net Pay Payable balance"
-- a SINGLE atomic, over-settlement-proof, idempotent, concurrency-safe
-- operation — replacing `bankTransactionService.recordSubledgerSettlement()`,
-- whose outstanding-balance cap lived ONLY in the React form (see 0095's
-- header for the exact double-tab/stale-state failure this fixes).
--
-- REQUIRED INVARIANT: a payroll run's Net Pay Payable obligation can NEVER
-- be settled for more than its authoritative outstanding amount — outstanding
-- = (the exact amount THIS run's own posted journal credited to its contra
-- account, read from `journal_lines`, never re-derived from the `payslips`
-- jsonb or trusted from the caller) MINUS (the sum of every settlement
-- already recorded in `subledger_settlements` for this run). The caller's
-- `p_amount` is the ONLY client-supplied figure this function trusts for
-- the money side of the check — never a caller-supplied "outstanding".
--
-- CONCURRENCY: the function LOCKS the `payroll_runs` row FOR UPDATE
-- BEFORE reading `subledger_settlements`' sum for this run. That ordering
-- — not merely "the check happens in one statement" — is what makes two
-- concurrent settlement attempts against the SAME run safe: whichever
-- transaction acquires the lock second is forced to wait until the first
-- COMMITS (or rolls back) before it can even run its own "sum of existing
-- settlements" query, so it always sees the first attempt's settlement
-- (if any) already reflected. Two attempts against DIFFERENT runs proceed
-- fully in parallel (different rows, different locks, never contend).
--
-- IDEMPOTENCY: `settlement_id` is a UUID the caller generates once per
-- "settle this much, now" intent (same convention as every other RPC in
-- this audit) — checked as a plain SELECT against `subledger_settlements`
-- immediately after acquiring the lock (before any validation), so a
-- retry of the identical request returns the original result unchanged
-- rather than re-validating (and potentially re-rejecting, if the first
-- attempt's success changed what "outstanding" now means) a request that
-- already succeeded.
--
-- NEVER touches the lease liability, ROU asset, or ANY payroll expense/
-- statutory-liability account — this function's only postings are DR the
-- clearing account (2250 Net Pay Payable) / CR the bank account's own GL
-- account. The payroll run's own journal (post_payroll_run, 0091) remains
-- the sole authority for Salaries/UIF/PAYE/SDL/Net-Pay-Payable.

create or replace function public.settle_payroll_net_pay(
  p_settlement_id   uuid,
  p_payroll_run_id  uuid,
  p_bank_account_id uuid,
  p_date            timestamptz,
  p_description     text,
  p_reference       text,
  p_amount          numeric,
  p_created_by      text
) returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_company           uuid := (select public.get_my_company_id());
  v_existing           public.subledger_settlements;
  v_run                public.payroll_runs;
  v_bank_account       public.bank_accounts;
  v_original_obligation numeric;
  v_already_settled    numeric;
  v_outstanding        numeric;
  v_je                 public.journal_entries;
  v_bank_txn           public.bank_transactions;
  v_settlement         public.subledger_settlements;
  v_allocation         jsonb;
begin
  if v_company is null then
    raise exception 'settle_payroll_net_pay: no company context';
  end if;
  if p_settlement_id is null then
    raise exception 'settle_payroll_net_pay: settlement_id is required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'settle_payroll_net_pay: amount must be greater than zero';
  end if;

  -- LOCK the run FIRST — the serialisation point every concurrent
  -- settlement attempt against this SAME run must pass through before it
  -- can read subledger_settlements' sum (see header).
  select * into v_run from public.payroll_runs
    where id = p_payroll_run_id and company_id = v_company
    for update;
  if not found then
    raise exception 'settle_payroll_net_pay: payroll run % not found in company', p_payroll_run_id;
  end if;

  -- IDEMPOTENCY — checked AFTER the lock, so a genuine retry racing a
  -- still-in-flight first attempt correctly waits for it, then returns
  -- its result, rather than re-validating against a stale outstanding.
  select * into v_existing from public.subledger_settlements
    where company_id = v_company and settlement_id = p_settlement_id;
  if found then
    return jsonb_build_object(
      'idempotent', true,
      'settlement', to_jsonb(v_existing),
      'bank_transaction_id', v_existing.bank_transaction_id,
      'journal_entry_id', v_existing.journal_entry_id);
  end if;

  if v_run.status <> 'posted' then
    raise exception 'settle_payroll_net_pay: payroll run % is not posted (status: %) — nothing to settle', v_run.run_number, v_run.status;
  end if;
  if v_run.reversed_at is not null then
    raise exception 'settle_payroll_net_pay: payroll run % has been reversed — its net pay was never disbursed and cannot be settled', v_run.run_number;
  end if;
  if v_run.journal_entry_id is null or v_run.contra_account_id is null then
    raise exception 'settle_payroll_net_pay: payroll run % has no posted clearing obligation', v_run.run_number;
  end if;

  -- AUTHORITATIVE original obligation: the exact amount this run's OWN
  -- journal credited to its OWN contra account — never re-summed from
  -- payslips (which could drift from what was actually posted).
  select coalesce(sum(jl.credit - jl.debit), 0) into v_original_obligation
    from public.journal_lines jl
   where jl.journal_entry_id = v_run.journal_entry_id
     and jl.account_id = v_run.contra_account_id
     and jl.company_id = v_company;

  -- AUTHORITATIVE existing settlements — summed from THIS table, never
  -- from bank_transactions.amount or trusted from the caller.
  select coalesce(sum(s.amount), 0) into v_already_settled
    from public.subledger_settlements s
   where s.company_id = v_company and s.source_type = 'payroll_run' and s.source_id = p_payroll_run_id;

  v_outstanding := round(v_original_obligation - v_already_settled, 2);

  if p_amount > v_outstanding + 0.01 then
    raise exception 'settle_payroll_net_pay: requested settlement % exceeds outstanding % for payroll run %', p_amount, v_outstanding, v_run.run_number;
  end if;

  -- open accounting period (create_journal_entry_with_lines does not check).
  if not exists (
    select 1 from public.accounting_periods p
    where p.company_id = v_company and p.status = 'open'
      and p_date::date between p.start_date and p.end_date
  ) then
    raise exception 'settle_payroll_net_pay: no open accounting period covers %', p_date::date;
  end if;

  select * into v_bank_account from public.bank_accounts where id = p_bank_account_id and company_id = v_company;
  if not found then
    raise exception 'settle_payroll_net_pay: bank account % not found in company', p_bank_account_id;
  end if;

  -- POST DR clearing account / CR bank account — the ONE real cash
  -- movement. Never touches Salaries/UIF/PAYE/SDL or any other account
  -- the run's own journal (0091) already posted.
  v_je := public.create_journal_entry_with_lines(
    v_company, '', p_date, coalesce(p_description, 'Net pay settlement - ' || v_run.run_number), 'posted', now(), null, 'bank_transaction', null,
    jsonb_build_array(
      jsonb_build_object('account_id', v_run.contra_account_id, 'description', p_description, 'debit', p_amount, 'credit', 0),
      jsonb_build_object('account_id', v_bank_account.gl_account_id, 'description', p_description, 'debit', 0, 'credit', p_amount)
    )
  );

  v_allocation := jsonb_build_array(jsonb_build_object(
    'id', 'stl_' || replace(gen_random_uuid()::text, '-', ''),
    'glAccountId', v_run.contra_account_id,
    'description', p_description,
    'netAmount', p_amount,
    'taxAmount', 0
  ));

  insert into public.bank_transactions (
    company_id, bank_account_id, date, description, reference, amount, direction, status,
    source, journal_entry_id, allocations, matched_entity_type, matched_entity_id
  ) values (
    v_company, p_bank_account_id, p_date, coalesce(p_description, 'Net pay settlement - ' || v_run.run_number), p_reference,
    p_amount, 'credit', 'matched', 'manual', v_je.id, v_allocation, 'payroll_run', p_payroll_run_id
  ) returning * into v_bank_txn;

  insert into public.subledger_settlements (
    company_id, settlement_id, source_type, source_id, amount, bank_account_id, bank_transaction_id, journal_entry_id, created_by
  ) values (
    v_company, p_settlement_id, 'payroll_run', p_payroll_run_id, p_amount, p_bank_account_id, v_bank_txn.id, v_je.id, p_created_by
  ) returning * into v_settlement;

  return jsonb_build_object(
    'idempotent', false,
    'settlement', to_jsonb(v_settlement),
    'bank_transaction_id', v_bank_txn.id,
    'journal_entry_id', v_je.id);
end;
$$;

revoke all on function public.settle_payroll_net_pay(
  uuid, uuid, uuid, timestamptz, text, text, numeric, text
) from public, anon;
grant execute on function public.settle_payroll_net_pay(
  uuid, uuid, uuid, timestamptz, text, text, numeric, text
) to authenticated;
