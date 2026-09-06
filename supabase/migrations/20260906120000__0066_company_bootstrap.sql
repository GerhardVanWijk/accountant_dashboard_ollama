-- 0066_company_bootstrap
-- COMMERCIAL FOUNDATION · BLOCK 1 — fix first-company creation (2026-09-06,
-- branch commercial-foundation-2026-09-06). PRE-MERGE. `main` untouched.
--
-- Additive/replacement only: `create_company_and_become_admin` REPLACED
-- (dropped + recreated with a wider signature), `protect_profile_privileged_columns`
-- REPLACED (adds a strictly-scoped bootstrap branch), one new internal
-- helper `seed_new_company_accounting`. NO RLS policy created/dropped/altered.
-- NO business/accounting data written by the migration itself.
--
-- ═══════════════════════════════════════════════════════════════════════
-- THE BUG (reproduced live, rollback-wrapped, 2026-09-06)
-- ═══════════════════════════════════════════════════════════════════════
-- A genuinely new authenticated user → /onboarding → "Create company" →
-- create_company_and_become_admin (migration 0012, SECURITY DEFINER):
--   1. INSERT INTO companies …            -- succeeds (definer bypasses RLS)
--   2. UPDATE profiles SET company_id=<new>, role='admin' WHERE id=auth.uid()
-- Step 2 is SILENTLY REVERTED by the protect_profile_privileged_columns
-- BEFORE-UPDATE trigger: SECURITY DEFINER changes the executing role, not
-- the JWT, so inside the trigger auth.uid() is the new user and
-- get_my_role() returns 'viewer' (the not-yet-committed stored value). The
-- caller is neither superuser nor admin → the trigger's lockdown branch
-- runs `new.role := old.role; new.company_id := old.company_id;`. Net:
-- orphan company row created, profile unchanged, RPC returns no error →
-- RouteGuard bounces the user back to /onboarding forever, one orphan
-- company per attempt. Migration 0012's comment claiming the RPC "bypasses
-- the self-update trigger by design" was factually wrong. Broken since
-- 2026-08-23; 0065 neither caused nor worsened it.
--
-- Compounding defect: NO per-company chart-of-accounts / financial-year /
-- period seeding exists anywhere, so even a fixed profile link yields an
-- empty, unusable company.
--
-- ═══════════════════════════════════════════════════════════════════════
-- THE FIX
-- ═══════════════════════════════════════════════════════════════════════
-- (A) protect_profile_privileged_columns gains ONE strictly-scoped branch
--     that honours a transaction-local GUC `vertex.bootstrap_company_id`.
--     It permits EXACTLY the first-company bootstrap transition and nothing
--     else: the caller's OWN companyless 'viewer' profile → role 'admin' +
--     company_id = that one specific just-created company, is_active
--     unchanged. A PostgREST/client update cannot set this GUC (PostgREST
--     exposes no set_config; no RPC sets it either) and, even if it could,
--     every clause below must hold — so it can never grant superuser, move
--     an existing company, touch another user, or flip is_active. The 0065
--     self-lockout branch and the superuser / no-auth.uid() early returns
--     are unchanged.
-- (B) create_company_and_become_admin is one atomic transaction:
--     validate caller → INSERT company → (GUC) link caller as admin →
--     verify the link actually took → seed default SA chart of accounts +
--     current financial year + 12 monthly periods → audit → return. Any
--     failure raises and the whole transaction rolls back: no orphan
--     company, no partial state, never a 0-row "success".
-- (C) seed_new_company_accounting(company, fy_end_month, fy_end_day) — the
--     reusable "default South African company bootstrap": generic CoA only
--     (every AccountMappingKey code in
--     src/features/accounting/services/accountMappingService.ts, plus the
--     generic operating-expense / income accounts from the demo CoA, minus
--     Office National's product-category-specific 40x0/50x0 accounts) +
--     financial year derived deterministically from the year-end config +
--     12 calendar-month periods. NO customers/suppliers/products/journals/
--     balances/stock/demo data.


-- ═════════════════════════════════════════════════════════════════════
-- 1. protect_profile_privileged_columns — + scoped bootstrap branch
-- ═════════════════════════════════════════════════════════════════════
create or replace function public.protect_profile_privileged_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Trusted direct DB connection (no auth.uid()): bootstrap / recovery. Unchanged.
  if (select auth.uid()) is null then
    return new;
  end if;

  if public.get_my_role() = 'superuser' then
    return new;
  end if;

  -- SCOPED FIRST-COMPANY BOOTSTRAP (0066). create_company_and_become_admin
  -- sets `vertex.bootstrap_company_id` (transaction-local) to the id of the
  -- company it just inserted, immediately before this UPDATE, and clears it
  -- immediately after. EVERY clause must hold: own row, was companyless,
  -- default signup role, moving to exactly that new company as 'admin',
  -- is_active untouched. Nothing else is permitted through here.
  if nullif(current_setting('vertex.bootstrap_company_id', true), '') is not null
     and old.id = (select auth.uid())
     and old.company_id is null
     and old.role = 'viewer'
     and new.company_id is not null
     and new.company_id::text = current_setting('vertex.bootstrap_company_id', true)
     and new.role = 'admin'
     and new.is_active is not distinct from old.is_active
  then
    return new;
  end if;

  if public.get_my_role() = 'admin'
     and (old.company_id is not distinct from (select public.get_my_company_id()) or old.company_id is null) then
    if new.role = 'superuser' then
      new.role := old.role;
    end if;

    -- SELF-LOCKOUT PROTECTION (0065) — unchanged.
    if old.id = (select auth.uid()) then
      if old.role = 'admin' and new.role is distinct from old.role then
        raise exception 'You cannot change your own administrator access level. Ask another administrator or a superuser to do it.'
          using errcode = '42501';
      end if;
      if old.is_active and not new.is_active then
        raise exception 'You cannot suspend your own account.'
          using errcode = '42501';
      end if;
    end if;

    return new;
  end if;

  new.role := old.role;
  new.company_id := old.company_id;
  new.is_active := old.is_active;
  return new;
end;
$$;

revoke all on function public.protect_profile_privileged_columns() from public;
revoke execute on function public.protect_profile_privileged_columns() from anon;
revoke execute on function public.protect_profile_privileged_columns() from authenticated;


-- ═════════════════════════════════════════════════════════════════════
-- 2. seed_new_company_accounting — reusable default SA bootstrap
-- ═════════════════════════════════════════════════════════════════════
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
    ('2300','Income Tax Payable','liability','credit'),
    ('2400','Deferred Tax Liability','liability','credit'),
    ('2450','Lease Liability','liability','credit'),
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

revoke all on function public.seed_new_company_accounting(uuid, smallint, smallint) from public;
revoke execute on function public.seed_new_company_accounting(uuid, smallint, smallint) from anon;
revoke execute on function public.seed_new_company_accounting(uuid, smallint, smallint) from authenticated;


-- ═════════════════════════════════════════════════════════════════════
-- 3. create_company_and_become_admin — atomic, seeded, no orphans
-- ═════════════════════════════════════════════════════════════════════
drop function if exists public.create_company_and_become_admin(text, public.legal_entity_type, smallint, smallint, text);

create function public.create_company_and_become_admin(
  p_name                     text,
  p_legal_entity_type        public.legal_entity_type,
  p_financial_year_end_month smallint,
  p_financial_year_end_day   smallint,
  p_functional_currency      text default 'ZAR',
  p_registration_number      text default null,
  p_trading_name             text default null,
  p_is_vat_registered        boolean default false,
  p_vat_registration_number  text default null,
  p_contact_email            text default null,
  p_contact_phone            text default null
) returns public.companies
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_role     public.profile_role;
  v_existing uuid;
  v_company  public.companies;
  v_currency text := coalesce(nullif(btrim(p_functional_currency), ''), 'ZAR');
begin
  if v_uid is null then
    raise exception 'You must be signed in to create a company.' using errcode = '42501';
  end if;

  select role, company_id into v_role, v_existing from public.profiles where id = v_uid;
  if not found then
    raise exception 'Your account is not fully set up yet — please sign out and in again.' using errcode = 'P0002';
  end if;
  if v_existing is not null then
    raise exception 'You already belong to a company.' using errcode = '42501';
  end if;
  if v_role = 'superuser' then
    raise exception 'A superuser account cannot own a company.' using errcode = '42501';
  end if;
  if v_role <> 'viewer' then
    raise exception 'This account cannot create a company. Please contact support.' using errcode = '42501';
  end if;

  if coalesce(btrim(p_name), '') = '' then
    raise exception 'A company name is required.' using errcode = '22004';
  end if;
  if p_financial_year_end_month is null or p_financial_year_end_month not between 1 and 12 then
    raise exception 'Financial year-end month must be between 1 and 12.' using errcode = '22003';
  end if;
  if p_financial_year_end_day is null or p_financial_year_end_day not between 1 and 31 then
    raise exception 'Financial year-end day must be between 1 and 31.' using errcode = '22003';
  end if;

  -- (1) company
  insert into public.companies (
    name, legal_entity_type, financial_year_end_month, financial_year_end_day,
    functional_currency, presentation_currency,
    registration_number, trading_name, is_vat_registered, vat_registration_number,
    phone, email
  )
  values (
    btrim(p_name), p_legal_entity_type, p_financial_year_end_month, p_financial_year_end_day,
    v_currency, v_currency,
    nullif(btrim(p_registration_number), ''), nullif(btrim(p_trading_name), ''),
    coalesce(p_is_vat_registered, false), nullif(btrim(p_vat_registration_number), ''),
    nullif(btrim(p_contact_phone), ''), nullif(btrim(p_contact_email), '')
  )
  returning * into v_company;

  -- (2) link the caller as admin — scoped bootstrap bypass, cleared immediately
  perform set_config('vertex.bootstrap_company_id', v_company.id::text, true);
  update public.profiles
     set company_id = v_company.id, role = 'admin', updated_at = now()
   where id = v_uid;
  perform set_config('vertex.bootstrap_company_id', '', true);

  if (select company_id from public.profiles where id = v_uid) is distinct from v_company.id then
    raise exception 'Could not link your profile to the new company — nothing was saved.' using errcode = 'P0001';
  end if;

  -- (3) default accounting foundation (CoA + financial year + periods)
  perform public.seed_new_company_accounting(v_company.id, p_financial_year_end_month, p_financial_year_end_day);

  -- (4) audit
  insert into public.audit_log_entries
    (company_id, user_id, action, module, record_type, record_id, new_value, reason)
  values
    (v_company.id, v_uid::text, 'created', 'admin', 'Company', v_company.id::text,
     jsonb_build_object('name', v_company.name, 'legalEntityType', v_company.legal_entity_type::text),
     'First company created via onboarding');

  return v_company;
end;
$$;

revoke all on function public.create_company_and_become_admin(text, public.legal_entity_type, smallint, smallint, text, text, text, boolean, text, text, text) from public, anon;
grant execute on function public.create_company_and_become_admin(text, public.legal_entity_type, smallint, smallint, text, text, text, boolean, text, text, text) to authenticated;


-- ═════════════════════════════════════════════════════════════════════
-- 4. Observability
-- ═════════════════════════════════════════════════════════════════════
do $$
begin
  if to_regprocedure('public.create_company_and_become_admin(text, public.legal_entity_type, smallint, smallint, text, text, text, boolean, text, text, text)') is null then
    raise exception '0066: create_company_and_become_admin (11-arg) was not created';
  end if;
  if to_regprocedure('public.create_company_and_become_admin(text, public.legal_entity_type, smallint, smallint, text)') is not null then
    raise exception '0066: the old 5-arg create_company_and_become_admin still exists';
  end if;
  if to_regprocedure('public.seed_new_company_accounting(uuid, smallint, smallint)') is null then
    raise exception '0066: seed_new_company_accounting was not created';
  end if;
  if has_function_privilege('anon', 'public.create_company_and_become_admin(text, public.legal_entity_type, smallint, smallint, text, text, text, boolean, text, text, text)', 'execute') then
    raise exception '0066: create_company_and_become_admin must not be anon-executable';
  end if;
  if has_function_privilege('authenticated', 'public.seed_new_company_accounting(uuid, smallint, smallint)', 'execute')
     or has_function_privilege('anon', 'public.protect_profile_privileged_columns()', 'execute') then
    raise exception '0066: internal helper grants are wrong';
  end if;
  raise notice '0066: OK — atomic company bootstrap + scoped trigger bypass + default SA accounting in place.';
end $$;
