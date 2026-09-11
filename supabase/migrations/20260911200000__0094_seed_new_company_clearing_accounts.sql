-- 0094_seed_new_company_clearing_accounts
-- Leases + Payroll accounting-integrity hardening (PART 3 — Banking/
-- payment architecture, follow-up to 0085). AUTHORED, NOT APPLIED. Apply
-- AFTER 0085 (this migration keeps `seed_new_company_accounting` in sync
-- with the two account codes 0085 introduces).
--
-- 0085 backfills 2250 Net Pay Payable / 2460 Lease Payment Clearing onto
-- every EXISTING company, but `seed_new_company_accounting()` — the
-- function `create_company_and_become_admin()` calls for every BRAND NEW
-- company (migration 0066) — was never updated to include them. Left
-- alone, a company created after 0085 applies would get a Chart of
-- Accounts missing both clearing accounts, and its very first payroll run
-- or lease amortization would fail outright with "account not found"
-- (`accountMappingService`/`post_payroll_run`/`post_lease_amortization_period`
-- all resolve these by code). `companyBootstrapMigration.test.ts` already
-- statically asserts every `AccountMappingKey` this codebase defines has a
-- matching code literal inside 0066's seed function's SQL text — the same
-- check that caught this gap while authoring 0085.
--
-- This migration is a byte-for-byte `create or replace` of 0066's
-- `seed_new_company_accounting`, with exactly two rows added to the VALUES
-- list (2250 immediately after 2240, 2460 immediately after 2450, matching
-- the account-family grouping the rest of the list already follows) — no
-- other line changed. `create or replace function` keeps the existing
-- REVOKE/no-grant posture (0066 revokes execute from public/anon/
-- authenticated entirely — this function is only ever called internally by
-- `create_company_and_become_admin`, itself `security definer`), so no
-- grant statements are needed here.

create or replace function public.seed_new_company_accounting(
  p_company_id   uuid,
  p_fy_end_month smallint,
  p_fy_end_day   smallint
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_fy_id       uuid;
  v_fy_end      date;
  v_fy_start    date;
  v_year        int := extract(year from current_date)::int;
  v_last_dom    int;
  v_month_start date;
  i             int;
begin
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'seed_new_company_accounting: company % does not exist', p_company_id using errcode = 'P0002';
  end if;
  if exists (select 1 from public.accounts where company_id = p_company_id) then
    raise exception 'seed_new_company_accounting: company % already has a chart of accounts', p_company_id using errcode = 'P0001';
  end if;
  if p_fy_end_month not between 1 and 12 or p_fy_end_day not between 1 and 31 then
    raise exception 'seed_new_company_accounting: invalid financial year-end %/%', p_fy_end_month, p_fy_end_day using errcode = '22003';
  end if;

  -- 2.1 generic South African chart of accounts (no product-category or demo accounts)
  insert into public.accounts (company_id, code, name, type, normal_balance)
  select p_company_id, t.code, t.name, t.acc_type::public.account_type, t.nb::public.debit_credit
  from (values
    ('1000','Cash and Bank','asset','debit'),
    ('1100','Accounts Receivable','asset','debit'),
    ('1150','Allowance for Doubtful Debts','asset','credit'),
    ('1200','Inventory','asset','debit'),
    ('1210','Inventory in Transit','asset','debit'),
    ('1220','Goods Delivered Not Invoiced','asset','debit'),
    ('1500','Fixed Assets','asset','debit'),
    ('1590','Accumulated Depreciation','asset','credit'),
    ('1600','Deferred Tax Asset','asset','debit'),
    ('1700','Right-of-Use Asset','asset','debit'),
    ('1790','Accumulated Depreciation - ROU','asset','credit'),
    ('2000','Accounts Payable','liability','credit'),
    ('2050','Goods Received Not Invoiced','liability','credit'),
    ('2100','VAT Output','liability','credit'),
    ('2110','VAT Input','asset','debit'),
    ('2200','PAYE Payable','liability','credit'),
    ('2210','UIF Employee Payable','liability','credit'),
    ('2220','UIF Employer Payable','liability','credit'),
    ('2230','SDL Payable','liability','credit'),
    ('2240','Other Deductions Payable','liability','credit'),
    ('2250','Net Pay Payable','liability','credit'),
    ('2300','Income Tax Payable','liability','credit'),
    ('2400','Deferred Tax Liability','liability','credit'),
    ('2450','Lease Liability','liability','credit'),
    ('2460','Lease Payment Clearing','liability','credit'),
    ('2500','Dividends Payable','liability','credit'),
    ('2510','Dividends Tax Payable','liability','credit'),
    ('2600','Customer Deposits','liability','credit'),
    ('3000','Share Capital','equity','credit'),
    ('3900','Retained Earnings','equity','credit'),
    ('3950','Opening Balance Equity','equity','credit'),
    ('4000','Sales Revenue','revenue','credit'),
    ('4050','Delivery & Service Income','revenue','credit'),
    ('4200','Gain on Disposal','revenue','credit'),
    ('4900','Interest Income','revenue','credit'),
    ('5000','Cost of Goods Sold','expense','debit'),
    ('5050','Inventory Adjustments','expense','debit'),
    ('5060','Purchase Price Variance','expense','debit'),
    ('5100','Operating Expenses','expense','debit'),
    ('5110','Rent Expense','expense','debit'),
    ('5120','Electricity','expense','debit'),
    ('5130','Internet & Telephone','expense','debit'),
    ('5140','Bank Charges','expense','debit'),
    ('5150','Insurance','expense','debit'),
    ('5160','Fuel & Delivery Expense','expense','debit'),
    ('5170','Repairs & Maintenance','expense','debit'),
    ('5180','Advertising & Marketing','expense','debit'),
    ('5190','Software & Subscriptions','expense','debit'),
    ('5200','Depreciation Expense','expense','debit'),
    ('5210','Cleaning & Office Upkeep','expense','debit'),
    ('5220','Professional Fees','expense','debit'),
    ('5230','Printing & Stationery','expense','debit'),
    ('5240','Staff Welfare','expense','debit'),
    ('5300','Loss on Disposal','expense','debit'),
    ('5400','Salaries Expense','expense','debit'),
    ('5410','UIF Employer Expense','expense','debit'),
    ('5420','SDL Expense','expense','debit'),
    ('5500','Income Tax Expense','expense','debit'),
    ('5600','Deferred Tax Expense','expense','debit'),
    ('5700','Impairment Loss - Expected Credit Losses','expense','debit'),
    ('5800','Depreciation Expense - ROU','expense','debit'),
    ('5810','Interest Expense - Lease','expense','debit')
  ) t(code, name, acc_type, nb);

  -- 2.2 financial year, derived deterministically from the year-end config
  v_last_dom := extract(day from (make_date(v_year, p_fy_end_month, 1) + interval '1 month - 1 day'))::int;
  if p_fy_end_day >= v_last_dom then
    v_fy_end := (make_date(v_year, p_fy_end_month, 1) + interval '1 month - 1 day')::date;
  else
    v_fy_end := make_date(v_year, p_fy_end_month, p_fy_end_day);
  end if;
  if v_fy_end < current_date then
    v_fy_end := (v_fy_end + interval '1 year')::date;
  end if;
  v_fy_start := (v_fy_end - interval '1 year' + interval '1 day')::date;

  insert into public.financial_years (company_id, name, start_date, end_date, status)
  values (
    p_company_id,
    'FY' || extract(year from v_fy_end)::text || ' (' || to_char(v_fy_start, 'Mon YYYY') || ' - ' || to_char(v_fy_end, 'Mon YYYY') || ')',
    v_fy_start, v_fy_end, 'open'
  )
  returning id into v_fy_id;

  -- 2.3 monthly periods covering the year
  for i in 0..13 loop
    v_month_start := (v_fy_start + (i || ' months')::interval)::date;
    exit when v_month_start > v_fy_end;
    insert into public.accounting_periods (company_id, financial_year_id, name, start_date, end_date, status)
    values (
      p_company_id, v_fy_id,
      to_char(v_month_start, 'FMMonth YYYY'),
      v_month_start,
      least((v_month_start + interval '1 month - 1 day')::date, v_fy_end),
      'open'
    );
  end loop;
end;
$$;

-- Observability, mirroring 0066's own closing check.
do $$
begin
  if to_regprocedure('public.seed_new_company_accounting(uuid, smallint, smallint)') is null then
    raise exception '0094: seed_new_company_accounting was not created';
  end if;
end $$;
