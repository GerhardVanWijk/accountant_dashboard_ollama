-- 0045b — Historical reclassification of pre-Increment-4A unapplied customer receipts
-- ============================================================================
-- AUTHORED, NOT APPLIED. Presented for the Review 4A-DB2 checkpoint.
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
-- ============================================================================
-- ORDERING FIX (Review 4A-DB1b, 2026-09-03)
-- ----------------------------------------------------------------------------
-- The first authored version tried to "claim the (company, receipt) slot" in
-- public.deposit_reclassification_log with a PLACEHOLDER journal_entry_id
-- ('00000000-...') BEFORE posting the JE, then backfill it. Migration 0046
-- defines that column as  `journal_entry_id uuid NOT NULL REFERENCES
-- public.journal_entries(id)`  — the placeholder violates the FK and neither
-- NULL nor a sentinel can be inserted. First execution aborted 23503 and the
-- whole transaction rolled back cleanly (0 rows written, journal counter
-- unmoved at 4174).
--
-- The schema is correct and stays strict (NOT NULL + FK + UNIQUE). This script
-- is reordered to never insert a placeholder:
--
--   Step 1  EARLY IDEMPOTENCY  — SELECT the (company_id, receipt_id) row in
--           deposit_reclassification_log. If it exists, RAISE and abort
--           BEFORE any JE is created. This is the normal "already done /
--           re-run" guard.
--   Step 2  SAFETY VALIDATION  — every previously reviewed check (receipt
--           exists / locked FOR UPDATE / exact unallocated_amount / original
--           JE posted with full AR credit / open period / 1100 + 2600 resolve
--           and 2600 is active-liability-credit / no stray reclassification
--           JE by memo).
--   Step 3  POST THE JE FIRST  — create_journal_entry_with_lines(company,''
--           -> allocate_journal_number, receipt date, reviewed memo,
--           source='reclassification', DR 1100 / CR 2600). Capture the REAL
--           returned v_je.id.
--   Step 4  INSERT THE LOG with the REAL v_je.id (no placeholder, no NULL),
--           `ON CONFLICT (company_id, receipt_id) DO NOTHING RETURNING id`.
--           A NULL return here means a concurrent transaction inserted the
--           same (company_id, receipt_id) between Step 1 and Step 4 — RAISE,
--           which rolls back the JE just posted, its journal_lines, and the
--           journal-number allocation (all in this one transaction).
--
-- TWO-LAYER IDEMPOTENCY
--   * Normal retry / already complete : the Step 1 SELECT aborts before any
--     write — no JE, no counter movement.
--   * Concurrent double-run : both transactions can pass Step 1, but the
--     UNIQUE (company_id, receipt_id) constraint lets only one INSERT succeed
--     at Step 4; the loser gets no returned id, RAISEs, and its freshly
--     posted JE + lines + counter increment all roll back. No duplicate
--     persistent JE remains.
--
-- JOURNAL-NUMBER ROLLBACK SAFETY
--   allocate_journal_number() is `UPDATE journal_number_counters
--   SET next_value = next_value + 1 ... RETURNING next_value - 1`. The UPDATE
--   holds a row lock for the life of the transaction; a concurrent allocator
--   for the same company blocks until this transaction ends. On ROLLBACK the
--   increment is undone and the number is reused by the next caller. Verified
--   against live behaviour: the failed first attempt left next_value = 4174
--   unchanged.
--
-- DETERMINISTIC IDENTITY: one row per corrected receipt in
-- public.deposit_reclassification_log (UNIQUE (company_id, receipt_id),
-- created by migration 0046). The memo-text check is a secondary sanity check.
--
-- ALL-OR-NOTHING: one BEGIN..COMMIT. Every prerequisite is asserted inside a
-- DO block; any failed assertion RAISEs and the whole transaction rolls back.
-- Journal numbers are allocated by the standard atomic allocate_journal_number()
-- (NOT a hard-coded JE-4174..4176 assumption). Four post-write reconciliation
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
      ----------------------------------------------------------------
      -- STEP 2a: receipt exists, correct company, LOCKED, exact balance
      ----------------------------------------------------------------
      select * into v_rcpt from public.customer_receipts
        where company_id = v_company and receipt_number = r.receipt_number
        for update;
      if not found then raise exception 'ABORT: receipt % not found', r.receipt_number; end if;
      if v_rcpt.unallocated_amount <> r.expected_unapplied then
        raise exception 'ABORT: % unallocated_amount is % (expected %) — state changed since inspection, re-verify',
          r.receipt_number, v_rcpt.unallocated_amount, r.expected_unapplied;
      end if;

      ----------------------------------------------------------------
      -- STEP 1: EARLY IDEMPOTENCY — abort BEFORE creating any JE
      ----------------------------------------------------------------
      if exists (
        select 1 from public.deposit_reclassification_log l
        where l.company_id = v_company and l.receipt_id = v_rcpt.id
      ) then
        raise exception 'ABORT: % already reclassified (deposit_reclassification_log row exists)', r.receipt_number;
      end if;

      -- secondary sanity check: no stray reclassification JE mentions this receipt
      if exists (
        select 1 from public.journal_entries je
        where je.company_id = v_company and je.source = 'reclassification'
          and je.memo like '%' || r.receipt_number || '%'
      ) then
        raise exception 'ABORT: a reclassification JE for % already exists (memo check)', r.receipt_number;
      end if;

      ----------------------------------------------------------------
      -- STEP 2b: original JE exists, is posted, credits AR for the full amount
      ----------------------------------------------------------------
      if v_rcpt.journal_entry_id is null then raise exception 'ABORT: % has no journal_entry_id', r.receipt_number; end if;
      select * into v_je from public.journal_entries where id = v_rcpt.journal_entry_id;
      if not found or v_je.status <> 'posted' then raise exception 'ABORT: % original JE missing/not posted', r.receipt_number; end if;
      select coalesce(sum(jl.credit - jl.debit), 0) into v_ar_credited
        from public.journal_lines jl where jl.journal_entry_id = v_je.id and jl.account_id = v_ar;
      if v_ar_credited < v_rcpt.amount - 0.005 then
        raise exception 'ABORT: % original JE credits AR only % (receipt amount %) — not the plain pre-4A posting',
          r.receipt_number, v_ar_credited, v_rcpt.amount;
      end if;

      ----------------------------------------------------------------
      -- STEP 2c: open period covering the receipt date
      ----------------------------------------------------------------
      if not exists (
        select 1 from public.accounting_periods p
        where p.company_id = v_company and p.status = 'open'
          and v_rcpt.date::date between p.start_date and p.end_date
      ) then
        raise exception 'ABORT: no open period covers % (%)', r.receipt_number, v_rcpt.date::date;
      end if;

      ----------------------------------------------------------------
      -- STEP 3: POST THE CORRECTION JE FIRST (canonical atomic path)
      ----------------------------------------------------------------
      v_je := public.create_journal_entry_with_lines(
        v_company, '', v_rcpt.date,
        'Increment 4A — reclassify unapplied ' || r.receipt_number || ' from Accounts Receivable to Customer Deposits',
        'posted', now(), coalesce(v_rcpt.currency, 'ZAR'), 'reclassification', null,
        jsonb_build_array(
          jsonb_build_object('account_id', v_ar::text, 'description', 'Reclassify unapplied ' || r.receipt_number, 'debit', r.expected_unapplied, 'credit', 0),
          jsonb_build_object('account_id', v_cd::text, 'description', 'Reclassify unapplied ' || r.receipt_number, 'debit', 0, 'credit', r.expected_unapplied)
        )
      );

      ----------------------------------------------------------------
      -- STEP 4: INSERT THE LOG WITH THE REAL JE id (no placeholder, no NULL)
      --         UNIQUE (company_id, receipt_id) is the race guard: a NULL
      --         return here means a concurrent txn won the slot -> RAISE,
      --         which rolls back the JE just posted above.
      ----------------------------------------------------------------
      insert into public.deposit_reclassification_log (company_id, receipt_id, journal_entry_id, unallocated_amount)
        values (v_company, v_rcpt.id, v_je.id, r.expected_unapplied)
        on conflict (company_id, receipt_id) do nothing
        returning id into v_reclass_id;
      if v_reclass_id is null then
        raise exception 'ABORT: % was reclassified concurrently between the pre-check and the log insert — rolling back the correction JE just posted', r.receipt_number;
      end if;
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

  -- every reclassification-log row points at a real posted reclassification JE
  select count(*) into v_cnt
    from public.deposit_reclassification_log l
    join public.journal_entries je on je.id = l.journal_entry_id
   where l.company_id = v_company and je.source = 'reclassification' and je.status = 'posted';
  if v_cnt <> 3 then raise exception 'ABORT: % log rows linked to a posted reclassification JE (expected 3)', v_cnt; end if;

  raise notice 'OK: 3 reclassification entries posted; GL 2600 = 4250.00; TB balanced; 3 log rows linked.';
end $$;

commit;
*/
