-- 0101_provisional_tax_atomic_posting
-- Tax & Compliance integrity audit, continuation (2026-09-12). AUTHORED, NOT APPLIED.
-- Apply AFTER 0007 (provisional_tax_periods) and 0033 (create_journal_entry_with_lines).
--
-- Same defect class as 0099 (Income Tax): `ProvisionalTaxService.payProvisionalTax()`
-- posts the journal (DR Income Tax Payable / CR Cash and Bank), then
-- SEPARATELY updates the relevant jsonb payment slot
-- (first_slot/second_slot/top_up_slot) on `provisional_tax_periods`. A
-- failure between them leaves a real posted GL journal with the slot still
-- showing unpaid, and a retry posts a SECOND payment for the same slot.
--
-- SCOPE: TypeScript (provisionalTaxService.ts) still owns the estimate
-- calculation (calculateTaxLiability(), reused from Income Tax — never
-- reimplemented here) and which two lines to post. This function performs
-- NO tax arithmetic; it takes the already-computed lines and either
-- commits the whole payment event (journal + slot update) or rolls all of
-- it back. Accounting stays exactly as already supported: DR Income Tax
-- Payable / CR Cash and Bank — the SAME liability account the final
-- TaxComputation.postComputation() will eventually credit, never a second
-- Income Tax Expense (see provisionalTaxService.ts's class doc comment).
--
-- IDEMPOTENCY / CONCURRENCY:
--   * `provisional_tax_payment_log` — UNIQUE (company_id,
--     provisional_tax_period_id, slot). Unlike a payroll run or a tax
--     computation (which post at most once, EVER), one
--     ProvisionalTaxPeriod has THREE independent, legitimate payment
--     events — first, second, and a voluntary top-up — so the idempotency
--     key must include the slot, not just the period id. First and second
--     payments are two different rows in this log and can both exist;
--     retrying the SAME slot is what gets deduplicated.
--   * The function LOCKS the provisional_tax_periods row FOR UPDATE and
--     re-reads the target slot's `paidDate` from the LOCKED row — two
--     concurrent pay attempts on the SAME slot (double-click / two tabs)
--     serialise on that lock; the second sees `paidDate` already set (or
--     the posting-log's UNIQUE constraint, whichever fires first) and
--     returns the FIRST call's result instead of posting a second payment.
--     A concurrent pay attempt on a DIFFERENT slot of the same period is
--     unaffected — both proceed, exactly as the app already allows two
--     slots to be paid independently.
--   * jsonb slot columns store the embedded `ProvisionalPaymentSlot` TS
--     object AS-IS (camelCase keys: dueDate/estimatedTaxableIncome/
--     estimatedTaxLiability/amountPaid/paidDate/journalEntryId — verified
--     against SupabaseProvisionalTaxPeriodRepository.ts, which round-trips
--     the object with no key transformation). This function reads/writes
--     those same camelCase keys, merging amountPaid/paidDate/
--     journalEntryId into the EXISTING slot object so dueDate/
--     estimatedTaxableIncome/estimatedTaxLiability are preserved untouched.

create table public.provisional_tax_payment_log (
  id                          uuid primary key default gen_random_uuid(),
  company_id                  uuid not null references public.companies(id) on delete cascade,
  provisional_tax_period_id   uuid not null,
  slot                        text not null check (slot in ('first', 'second', 'topUp')),
  journal_entry_id            uuid references public.journal_entries(id),
  created_by                  text,
  created_at                  timestamptz not null default now(),
  unique (company_id, provisional_tax_period_id, slot)
);

create index provisional_tax_payment_log_company_id_idx
  on public.provisional_tax_payment_log (company_id);

alter table public.provisional_tax_payment_log enable row level security;

create policy provisional_tax_payment_log_all_own_company
  on public.provisional_tax_payment_log for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

create or replace function public.pay_provisional_tax(
  p_period_id  uuid,
  p_slot       text,
  p_amount_paid numeric,
  p_date       timestamptz,
  p_memo       text,
  p_source     text,
  p_lines      jsonb,
  p_posted_by  text
) returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_company       uuid := (select public.get_my_company_id());
  v_log_id        uuid;
  v_existing      public.provisional_tax_payment_log;
  v_period        public.provisional_tax_periods;
  v_current_slot  jsonb;
  v_new_slot      jsonb;
  v_je            public.journal_entries;
  v_total_debit   numeric;
  v_total_credit  numeric;
begin
  if v_company is null then
    raise exception 'pay_provisional_tax: no company context';
  end if;
  if not public.has_permission('tax', 'post') then
    raise exception 'pay_provisional_tax: missing required permission tax:post' using errcode = '42501';
  end if;
  if p_period_id is null then
    raise exception 'pay_provisional_tax: period_id is required';
  end if;
  if p_slot not in ('first', 'second', 'topUp') then
    raise exception 'pay_provisional_tax: invalid slot "%" — must be first, second, or topUp', p_slot;
  end if;
  if p_amount_paid is null or p_amount_paid <= 0 then
    raise exception 'pay_provisional_tax: amount paid must be greater than 0';
  end if;

  -- IDEMPOTENCY on (period, slot) — NOT the period alone, since a period has 3 independent legitimate payment events.
  insert into public.provisional_tax_payment_log (company_id, provisional_tax_period_id, slot, created_by)
  values (v_company, p_period_id, p_slot, p_posted_by)
  on conflict (company_id, provisional_tax_period_id, slot) do nothing
  returning id into v_log_id;

  if v_log_id is null then
    select * into v_existing from public.provisional_tax_payment_log
      where company_id = v_company and provisional_tax_period_id = p_period_id and slot = p_slot;
    select * into v_period from public.provisional_tax_periods
      where id = p_period_id and company_id = v_company;
    return jsonb_build_object(
      'idempotent', true,
      'journal_entry_id', v_existing.journal_entry_id,
      'period', to_jsonb(v_period));
  end if;

  -- LOCK the period — serialises a concurrent pay attempt on the SAME slot.
  select * into v_period from public.provisional_tax_periods
    where id = p_period_id and company_id = v_company
    for update;
  if not found then
    raise exception 'pay_provisional_tax: provisional tax period % not found in company', p_period_id;
  end if;

  -- RE-VALIDATE the target slot against the LOCKED row.
  v_current_slot := case p_slot
    when 'first' then v_period.first_slot
    when 'second' then v_period.second_slot
    when 'topUp' then v_period.top_up_slot
  end;
  if v_current_slot is null then
    raise exception 'pay_provisional_tax: period % has no "%" slot to pay', p_period_id, p_slot;
  end if;
  if (v_current_slot ->> 'paidDate') is not null then
    raise exception 'pay_provisional_tax: the "%" slot for "%" has already been recorded as paid', p_slot, v_period.financial_year_label;
  end if;

  -- Open accounting period check (create_journal_entry_with_lines does not check).
  if not exists (
    select 1 from public.accounting_periods p
    where p.company_id = v_company and p.status = 'open'
      and p_date::date between p.start_date and p.end_date
  ) then
    raise exception 'pay_provisional_tax: no open accounting period covers %', p_date::date;
  end if;

  -- JOURNAL BALANCING: re-verify the sum rather than inheriting create_journal_entry_with_lines()'s trust silently.
  select coalesce(sum((l ->> 'debit')::numeric), 0), coalesce(sum((l ->> 'credit')::numeric), 0)
    into v_total_debit, v_total_credit
    from jsonb_array_elements(p_lines) l;
  if abs(v_total_debit - v_total_credit) > 0.01 then
    raise exception 'pay_provisional_tax: lines do not balance (debit % vs credit %)', v_total_debit, v_total_credit;
  end if;

  -- BANKING FIX (migration-review addendum, §3 — duplicate-post risk):
  -- reject a line that credits/debits a bank account's OWN GL account
  -- directly. The real EFT to SARS is recorded exactly once, later,
  -- through the existing Banking module (a Direct Payment, or an
  -- allocated imported statement line) against the Provisional Tax
  -- Payment Clearing account (code 2270, migration 0107) — never posted a
  -- second time here. Same fix, same reasoning as post_payroll_run
  -- (0091) / post_lease_amortization_period (0089) refusing a direct-to-
  -- Cash contra account.
  if exists (
    select 1
    from jsonb_array_elements(p_lines) l
    join public.bank_accounts ba
      on ba.gl_account_id = (l ->> 'account_id')::uuid and ba.company_id = v_company
  ) then
    raise exception 'pay_provisional_tax: a line posts directly to a bank account''s GL account — credit the Provisional Tax Payment Clearing account (2270) instead; the actual EFT is recorded once, later, through Banking.';
  end if;

  v_je := public.create_journal_entry_with_lines(
    v_company, '', p_date, p_memo, 'posted', now(), null, p_source, null, p_lines
  );

  -- Merge amountPaid/paidDate/journalEntryId into the EXISTING slot object — dueDate/estimatedTaxableIncome/estimatedTaxLiability are preserved untouched.
  v_new_slot := v_current_slot || jsonb_build_object(
    'amountPaid', p_amount_paid,
    'paidDate', to_char(p_date, 'YYYY-MM-DD'),
    'journalEntryId', v_je.id
  );

  update public.provisional_tax_periods
     set first_slot   = case when p_slot = 'first' then v_new_slot else first_slot end,
         second_slot  = case when p_slot = 'second' then v_new_slot else second_slot end,
         top_up_slot  = case when p_slot = 'topUp' then v_new_slot else top_up_slot end,
         updated_at   = now()
   where id = p_period_id and company_id = v_company
   returning * into v_period;

  update public.provisional_tax_payment_log set journal_entry_id = v_je.id where id = v_log_id;

  return jsonb_build_object('idempotent', false, 'journal_entry_id', v_je.id, 'period', to_jsonb(v_period));
end;
$$;

revoke all on function public.pay_provisional_tax(
  uuid, text, numeric, timestamptz, text, text, jsonb, text
) from public, anon;
grant execute on function public.pay_provisional_tax(
  uuid, text, numeric, timestamptz, text, text, jsonb, text
) to authenticated;
