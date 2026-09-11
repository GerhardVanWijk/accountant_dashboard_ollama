-- 0097_lease_period_settlement_rpc
-- Leases + Payroll integrity hardening — FINAL PRE-MIGRATION HARDENING,
-- PART A (database-level over-settlement protection) + PART B (lease
-- clearing becomes period-traceable, not one opaque cumulative balance).
-- AUTHORED, NOT APPLIED. Apply AFTER 0089 (lease_amortization_entries has
-- existed since 0008; this migration just locks/reads it) and 0095
-- (subledger_settlements).
--
-- PART B: before this migration, a lease's Lease Payment Clearing
-- "outstanding" was computed cumulatively — total interest+principal ever
-- charged across EVERY amortization period, minus total settlements ever
-- recorded, as ONE number. For a 36-60 month lease that number is
-- unauditable: R25,000 outstanding could mean "3 unpaid months" or "one
-- partial payment 18 months ago that was never followed up" — no way to
-- tell which. `settle_lease_period_payment` settles ONE specific
-- `lease_amortization_entries` ROW (one period) at a time —
-- `source_type = 'lease_amortization_entry'`, `source_id` = that row's own
-- id — so "outstanding" is always a property of a single period, and the
-- Lease Detail payment schedule (application layer) can show exactly
-- which months are Settled / Partially Settled / Outstanding, matching
-- 0086's `bank_transactions.matched_entity_type` rename from the prior
-- pass's lease-level 'lease_contract' to this.
--
-- REQUIRED INVARIANT (same as 0096, scoped to one period): a period's
-- clearing obligation (interest_amount + principal_amount, read directly
-- off its own `lease_amortization_entries` row — the exact figures
-- `post_lease_amortization_period`, 0089, already posted and will never
-- recompute) can NEVER be settled for more than that. Outstanding =
-- obligation MINUS sum of every `subledger_settlements` row already
-- recorded against this SPECIFIC entry id.
--
-- CONCURRENCY: identical pattern to 0096 — LOCKS the
-- `lease_amortization_entries` row FOR UPDATE before reading
-- `subledger_settlements`' sum for it, so two concurrent settlement
-- attempts against the SAME period serialise correctly; different periods
-- (even on the same lease) never contend.
--
-- NEVER touches the Lease Liability (2450) or Right-of-Use Asset (1700)
-- accounts, and never posts a second amortization entry — this function's
-- only postings are DR the clearing account (2460 Lease Payment Clearing,
-- validated as a liability account, same guard `post_lease_amortization_period`
-- already applies) / CR the bank account's own GL account. IFRS 16
-- recognition remains solely `post_lease_commencement`/
-- `post_lease_amortization_period`'s responsibility.

create or replace function public.settle_lease_period_payment(
  p_settlement_id                 uuid,
  p_lease_amortization_entry_id   uuid,
  p_bank_account_id               uuid,
  p_date                          timestamptz,
  p_description                   text,
  p_reference                     text,
  p_amount                        numeric,
  p_created_by                    text
) returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_company            uuid := (select public.get_my_company_id());
  v_existing            public.subledger_settlements;
  v_entry               public.lease_amortization_entries;
  v_lease                public.lease_contracts;
  v_bank_account         public.bank_accounts;
  v_original_obligation  numeric;
  v_already_settled      numeric;
  v_outstanding          numeric;
  v_clearing_account_id  uuid;
  v_clearing             public.accounts;
  v_je                   public.journal_entries;
  v_bank_txn             public.bank_transactions;
  v_settlement           public.subledger_settlements;
  v_allocation           jsonb;
begin
  if v_company is null then
    raise exception 'settle_lease_period_payment: no company context';
  end if;
  if p_settlement_id is null then
    raise exception 'settle_lease_period_payment: settlement_id is required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'settle_lease_period_payment: amount must be greater than zero';
  end if;

  -- LOCK the specific period FIRST — see header.
  select * into v_entry from public.lease_amortization_entries
    where id = p_lease_amortization_entry_id and company_id = v_company
    for update;
  if not found then
    raise exception 'settle_lease_period_payment: lease amortization entry % not found in company', p_lease_amortization_entry_id;
  end if;

  -- IDEMPOTENCY — after the lock, same reasoning as 0096.
  select * into v_existing from public.subledger_settlements
    where company_id = v_company and settlement_id = p_settlement_id;
  if found then
    return jsonb_build_object(
      'idempotent', true,
      'settlement', to_jsonb(v_existing),
      'bank_transaction_id', v_existing.bank_transaction_id,
      'journal_entry_id', v_existing.journal_entry_id);
  end if;

  select * into v_lease from public.lease_contracts where id = v_entry.lease_id and company_id = v_company;
  if not found then
    raise exception 'settle_lease_period_payment: lease % not found in company', v_entry.lease_id;
  end if;

  -- AUTHORITATIVE original obligation for THIS PERIOD — read directly off
  -- the entry post_lease_amortization_period (0089) already wrote.
  v_original_obligation := round(v_entry.interest_amount + v_entry.principal_amount, 2);

  -- AUTHORITATIVE existing settlements — scoped to THIS entry id, never
  -- to the lease as a whole (Part B).
  select coalesce(sum(s.amount), 0) into v_already_settled
    from public.subledger_settlements s
   where s.company_id = v_company and s.source_type = 'lease_amortization_entry' and s.source_id = p_lease_amortization_entry_id;

  v_outstanding := round(v_original_obligation - v_already_settled, 2);

  if p_amount > v_outstanding + 0.01 then
    raise exception 'settle_lease_period_payment: requested settlement % exceeds outstanding % for lease % period ending %', p_amount, v_outstanding, v_lease.lease_number, v_entry.period_end;
  end if;

  -- open accounting period (create_journal_entry_with_lines does not check).
  if not exists (
    select 1 from public.accounting_periods p
    where p.company_id = v_company and p.status = 'open'
      and p_date::date between p.start_date and p.end_date
  ) then
    raise exception 'settle_lease_period_payment: no open accounting period covers %', p_date::date;
  end if;

  select * into v_bank_account from public.bank_accounts where id = p_bank_account_id and company_id = v_company;
  if not found then
    raise exception 'settle_lease_period_payment: bank account % not found in company', p_bank_account_id;
  end if;

  -- Resolve 2460 Lease Payment Clearing by code, same as
  -- post_lease_amortization_period (0089) — the ONLY account this
  -- function may ever credit/debit on the subledger side, validated as a
  -- liability (belt-and-braces, mirrors 0089's identical guard).
  select id into v_clearing_account_id from public.accounts where company_id = v_company and code = '2460';
  if v_clearing_account_id is null then
    raise exception 'settle_lease_period_payment: Lease Payment Clearing (2460) account not found in company';
  end if;
  select * into v_clearing from public.accounts where id = v_clearing_account_id;
  if v_clearing.type <> 'liability' then
    raise exception 'settle_lease_period_payment: account 2460 "%" must be a liability/clearing account, not %', v_clearing.name, v_clearing.type;
  end if;

  -- POST DR clearing account / CR bank account. Never references acc_1700
  -- (Right-of-Use Asset) or acc_2450 (Lease Liability).
  v_je := public.create_journal_entry_with_lines(
    v_company, '', p_date, coalesce(p_description, 'Lease payment settlement - ' || v_lease.lease_number || ' (' || v_entry.period_end || ')'), 'posted', now(), null, 'bank_transaction', null,
    jsonb_build_array(
      jsonb_build_object('account_id', v_clearing_account_id, 'description', p_description, 'debit', p_amount, 'credit', 0),
      jsonb_build_object('account_id', v_bank_account.gl_account_id, 'description', p_description, 'debit', 0, 'credit', p_amount)
    )
  );

  v_allocation := jsonb_build_array(jsonb_build_object(
    'id', 'stl_' || replace(gen_random_uuid()::text, '-', ''),
    'glAccountId', v_clearing_account_id,
    'description', p_description,
    'netAmount', p_amount,
    'taxAmount', 0
  ));

  insert into public.bank_transactions (
    company_id, bank_account_id, date, description, reference, amount, direction, status,
    source, journal_entry_id, allocations, matched_entity_type, matched_entity_id
  ) values (
    v_company, p_bank_account_id, p_date, coalesce(p_description, 'Lease payment settlement - ' || v_lease.lease_number), p_reference,
    p_amount, 'credit', 'matched', 'manual', v_je.id, v_allocation, 'lease_amortization_entry', p_lease_amortization_entry_id
  ) returning * into v_bank_txn;

  insert into public.subledger_settlements (
    company_id, settlement_id, source_type, source_id, amount, bank_account_id, bank_transaction_id, journal_entry_id, created_by
  ) values (
    v_company, p_settlement_id, 'lease_amortization_entry', p_lease_amortization_entry_id, p_amount, p_bank_account_id, v_bank_txn.id, v_je.id, p_created_by
  ) returning * into v_settlement;

  return jsonb_build_object(
    'idempotent', false,
    'settlement', to_jsonb(v_settlement),
    'bank_transaction_id', v_bank_txn.id,
    'journal_entry_id', v_je.id);
end;
$$;

revoke all on function public.settle_lease_period_payment(
  uuid, uuid, uuid, timestamptz, text, text, numeric, text
) from public, anon;
grant execute on function public.settle_lease_period_payment(
  uuid, uuid, uuid, timestamptz, text, text, numeric, text
) to authenticated;
