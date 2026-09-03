-- 0045b — Historical reclassification of pre-Increment-4A unapplied customer receipts
-- ============================================================================
-- AUTHORED, NOT APPLIED. Presented for the Review 4A-4 checkpoint.
--
-- DO NOT RUN until:
--   1. migrations 0045 + 0046 have been applied, AND
--   2. this exact script is explicitly approved, AND
--   3. its prerequisites are re-verified read-only immediately before execution.
--
-- WHY THIS EXISTS
-- Before Increment 4A, customerReceiptService.recordReceipt() credited
-- Accounts Receivable (1100) for the FULL receipt amount regardless of
-- allocation. Three live receipts (all Office National Demo) carry an
-- unapplied balance whose credit therefore sits in AR instead of the new
-- 2600 Customer Deposits liability. Total: R4,250.00.
--   REC-1015  2026-08-06  JE-1073  R1,000.00  (August 2026 period)
--   REC-1016  2026-08-23  JE-1074    R750.00  (August 2026 period)
--   REC-1217  2026-09-30  JE-4163  R2,500.00  (September 2026 period)
--
-- The R1,750 figure in officeNationalSubledgerScenario.ts is a 2026-08-28 code
-- SNAPSHOT (REC-1015 + REC-1016 only); REC-1217 was created later by seed 0044.
-- R4,250.00 is the current LIVE total this script corrects; it is NOT a
-- permanent business rule — this is a one-time migration of legacy state.
--
-- This script does NOT edit any historical journal entry (JE-1073/1074/4163
-- are untouched). It posts THREE NEW correction entries, each
--   DR 1100 Accounts Receivable   <unapplied amount>
--     CR 2600 Customer Deposits    <unapplied amount>
-- dated at the original receipt's own date, source = 'reclassification'.
--
-- DETERMINISTIC IDEMPOTENCY: one row per corrected receipt in
-- public.deposit_reclassification_log (UNIQUE (company_id, receipt_id),
-- created by migration 0046). The INSERT ... ON CONFLICT DO NOTHING is the
-- primary duplicate guard; the memo-text check is a secondary sanity check.
--
-- ALL-OR-NOTHING: one BEGIN..COMMIT. Every prerequisite is asserted inside a
-- DO block; any failed assertion RAISEs and the whole transaction rolls back.
-- Journal numbers are allocated by the standard atomic allocate_journal_number()
-- (NOT a hard-coded JE-4174..4176 assumption). Two post-write reconciliation
-- assertions must pass before COMMIT.
-- ============================================================================

/*
begin;

do $$
declare
  v_company uuid := '676c6cda-2e67-4ee3-8aaa-249b2c6bbc01';   -- Office National Demo (Pty) Ltd
  v_ar   uuid;
  v_cd   uuid;
  r      record;
  v_cnt  int;
  v_tb   numeric;
  v_2600 numeric;
begin
  ------------------------------------------------------------------
  -- account resolution — dynamic, and type-checked
  ------------------------------------------------------------------
  select id into v_ar from public.accounts
    where company_id = v_company and code = '1100' and is_active;
  if v_ar is null then raise exception 'ABORT: no active 1100 Accounts Receivable account'; end if;

  select id into v_cd from public.accounts
    where company_id = v_company and code = '2600'
      and is_active and type = 'liability' and normal_balance = 'credit';
  if v_cd is null then
    raise exception 'ABORT: no active credit-normal liability account 2600 — apply migration 0045 first';
  end if;

  ------------------------------------------------------------------
  -- per-receipt prerequisites + posting
  ------------------------------------------------------------------
  for r in
    select * from (values
      ('REC-1015', numeric '1000.00'),
      ('REC-1016', numeric  '750.00'),
      ('REC-1217', numeric '2500.00')
    ) as t(receipt_number, expected_unapplied)
  loop
    declare
      v_rcpt public.customer_receipts;
      v_je   public.journal_entries;
      v_ar_credited numeric;
      v_reclass_id uuid;
    begin
      -- receipt still exists, in this company, with the expected unapplied balance
      select * into v_rcpt from public.customer_receipts
        where company_id = v_company and receipt_number = r.receipt_number
        for update;
      if not found then raise exception 'ABORT: receipt % not found', r.receipt_number; end if;
      if v_rcpt.unallocated_amount <> r.expected_unapplied then
        raise exception 'ABORT: % unallocated_amount is % (expected %) — state changed since inspection, re-verify',
          r.receipt_number, v_rcpt.unallocated_amount, r.expected_unapplied;
      end if;

      -- DETERMINISTIC idempotency: claim the (company, receipt) slot first.
      insert into public.deposit_reclassification_log (company_id, receipt_id, journal_entry_id, unallocated_amount)
        values (v_company, v_rcpt.id, '00000000-0000-0000-0000-000000000000', r.expected_unapplied)
        on conflict (company_id, receipt_id) do nothing
        returning id into v_reclass_id;
      if v_reclass_id is null then
        raise exception 'ABORT: % already reclassified (deposit_reclassification_log)', r.receipt_number;
      end if;

      -- secondary sanity check: no stray reclassification JE mentions this receipt
      if exists (
        select 1 from public.journal_entries je
        where je.company_id = v_company and je.source = 'reclassification'
          and je.memo like '%' || r.receipt_number || '%'
      ) then
        raise exception 'ABORT: a reclassification JE for % already exists (memo check)', r.receipt_number;
      end if;

      -- original JE exists, is posted, and currently credits AR for the full amount
      if v_rcpt.journal_entry_id is null then raise exception 'ABORT: % has no journal_entry_id', r.receipt_number; end if;
      select * into v_je from public.journal_entries where id = v_rcpt.journal_entry_id;
      if not found or v_je.status <> 'posted' then raise exception 'ABORT: % original JE missing/not posted', r.receipt_number; end if;
      select coalesce(sum(jl.credit - jl.debit), 0) into v_ar_credited
        from public.journal_lines jl where jl.journal_entry_id = v_je.id and jl.account_id = v_ar;
      if v_ar_credited < v_rcpt.amount - 0.005 then
        raise exception 'ABORT: % original JE credits AR only % (receipt amount %) — not the plain pre-4A posting',
          r.receipt_number, v_ar_credited, v_rcpt.amount;
      end if;

      -- open period covering the receipt date
      if not exists (
        select 1 from public.accounting_periods p
        where p.company_id = v_company and p.status = 'open'
          and v_rcpt.date::date between p.start_date and p.end_date
      ) then
        raise exception 'ABORT: no open period covers % (%)', r.receipt_number, v_rcpt.date::date;
      end if;

      -- post the correction entry via the canonical atomic path
      v_je := public.create_journal_entry_with_lines(
        v_company, '', v_rcpt.date,
        'Increment 4A — reclassify unapplied ' || r.receipt_number || ' from Accounts Receivable to Customer Deposits',
        'posted', now(), coalesce(v_rcpt.currency, 'ZAR'), 'reclassification', null,
        jsonb_build_array(
          jsonb_build_object('account_id', v_ar::text, 'description', 'Reclassify unapplied ' || r.receipt_number, 'debit', r.expected_unapplied, 'credit', 0),
          jsonb_build_object('account_id', v_cd::text, 'description', 'Reclassify unapplied ' || r.receipt_number, 'debit', 0, 'credit', r.expected_unapplied)
        )
      );

      update public.deposit_reclassification_log set journal_entry_id = v_je.id where id = v_reclass_id;
    end;
  end loop;

  ------------------------------------------------------------------
  -- POST-WRITE RECONCILIATION ASSERTIONS (roll back if any fail)
  ------------------------------------------------------------------
  select coalesce(sum(jl.credit - jl.debit), 0) into v_2600
    from public.journal_lines jl join public.journal_entries je on je.id = jl.journal_entry_id
    where je.company_id = v_company and je.status = 'posted' and jl.account_id = v_cd;
  if v_2600 <> 4250.00 then
    raise exception 'ABORT: GL 2600 balance is % after reclassification (expected 4250.00)', v_2600;
  end if;

  select coalesce(sum(jl.debit - jl.credit), 0) into v_tb
    from public.journal_lines jl join public.journal_entries je on je.id = jl.journal_entry_id
    where je.company_id = v_company and je.status = 'posted';
  if abs(v_tb) > 0.005 then
    raise exception 'ABORT: whole-company trial balance is % (expected 0.00)', v_tb;
  end if;

  select count(*) into v_cnt from public.deposit_reclassification_log where company_id = v_company;
  if v_cnt <> 3 then raise exception 'ABORT: % reclassification-log rows (expected 3)', v_cnt; end if;

  select count(*) into v_cnt from public.journal_entries
    where company_id = v_company and source = 'reclassification';
  if v_cnt <> 3 then raise exception 'ABORT: % reclassification JEs posted (expected 3)', v_cnt; end if;

  raise notice 'OK: 3 reclassification entries posted; GL 2600 = 4250.00; TB balanced.';
end $$;

commit;
*/
