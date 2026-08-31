-- Backfilled from supabase_migrations.schema_migrations (already applied to the live project).
-- version: 20260823084602 · name: 0001_bootstrap

-- Phase A: Core & Identity schema, mirroring the REAL TypeScript domain
-- types in src/types/company.ts, financialYear.ts, accountingPeriod.ts,
-- account.ts (see the Accounting Suite Atlas §3.1) rather than a generic
-- accounting schema. auth.users is Supabase's own built-in table.

-- ============================================================= enums ====
create type legal_entity_type as enum (
  'private_company','public_company','personal_liability_company',
  'state_owned_company','non_profit_company','close_corporation',
  'sole_proprietor','partnership','trust','external_company','other'
);

create type reporting_framework as enum (
  'full_ifrs','ifrs_for_smes','other_sa_framework','grap','not_yet_determined'
);

create type accounting_basis as enum ('accrual','cash');

create type financial_statement_compilation as enum ('internal','independent');

create type vat_filing_frequency as enum ('monthly','bi_monthly','six_monthly','annual');

create type vat_accounting_basis as enum ('invoice','payments');

create type profile_role as enum ('admin','accountant','manager','operator','viewer');

create type financial_year_status as enum ('open','closed');

create type accounting_period_status as enum ('open','soft_closed','closed','locked');

create type account_type as enum ('asset','liability','equity','revenue','expense');

create type debit_credit as enum ('debit','credit');

-- ============================================================ companies ==
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  registration_number text,
  legal_entity_type legal_entity_type not null,
  is_public_company boolean not null default false,
  is_listed boolean not null default false,
  has_public_accountability boolean not null default false,
  public_interest_score numeric,
  reporting_framework reporting_framework not null default 'not_yet_determined',
  reporting_framework_set_by uuid,
  reporting_framework_set_at timestamptz,
  reporting_framework_override_reason text,
  financial_year_end_month smallint not null check (financial_year_end_month between 1 and 12),
  financial_year_end_day smallint not null check (financial_year_end_day between 1 and 31),
  accounting_basis accounting_basis not null default 'accrual',
  functional_currency text not null default 'ZAR',
  presentation_currency text not null default 'ZAR',
  financial_statements_compilation financial_statement_compilation,
  is_vat_registered boolean not null default false,
  vat_registration_number text,
  vat_registration_date date,
  vat_deregistration_date date,
  vat_filing_frequency vat_filing_frequency,
  vat_accounting_basis vat_accounting_basis,
  income_tax_number text,
  sdl_exempt boolean,
  is_sbc_eligible boolean,
  sbc_eligibility_set_by uuid,
  sbc_eligibility_set_at timestamptz,
  sbc_eligibility_reason text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.companies is 'SA_ACCOUNTING_MASTER_SPEC.md §2 — mirrors src/types/company.ts''s Company interface field for field.';

-- ============================================================= profiles ==
-- Replaces the stub User/Role types (Atlas §3.1) with real Supabase Auth.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  role profile_role not null default 'viewer',
  company_id uuid references public.companies(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'Real per-user identity, 1:1 with auth.users. Replaces the SYSTEM_USER_ID stub every service currently falls back to.';

-- Resolve the circular company<->profile reference now that both exist.
alter table public.companies
  add constraint companies_reporting_framework_set_by_fkey
    foreign key (reporting_framework_set_by) references public.profiles(id),
  add constraint companies_sbc_eligibility_set_by_fkey
    foreign key (sbc_eligibility_set_by) references public.profiles(id);

-- Auto-create a profile row whenever a new auth user signs up — the
-- standard Supabase pattern, avoids relying on an RLS INSERT policy for
-- profile creation (and the chicken-and-egg problem of a brand-new user
-- having no row to reference yet).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===================================================== financial_years ==
create table public.financial_years (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  status financial_year_status not null default 'open',
  closed_at timestamptz,
  closed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date > start_date)
);

-- =================================================== accounting_periods ==
create table public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  financial_year_id uuid not null references public.financial_years(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  status accounting_period_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date > start_date)
);
comment on table public.accounting_periods is 'postJournalEntry() must reject posting outside a row here with status = open (docs/LEDGER_ARCHITECTURE.md).';

-- ============================================================= accounts ==
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  type account_type not null,
  sub_type text,
  parent_account_id uuid references public.accounts(id),
  normal_balance debit_credit not null,
  is_active boolean not null default true,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);
comment on table public.accounts is 'Chart of Accounts. NOTE: the current src/types/account.ts Account type has no companyId field (single-tenant today) — company_id is NOT NULL here for multi-tenant readiness; SupabaseAccountRepository (Phase B) must resolve it internally rather than expecting it from the existing CreateAccountDTO. Flagged, not silently decided.';

-- indexes on FK columns not already covered by a unique constraint
create index accounts_parent_account_id_idx on public.accounts(parent_account_id);
create index accounting_periods_financial_year_id_idx on public.accounting_periods(financial_year_id);
create index financial_years_closed_by_idx on public.financial_years(closed_by);

-- ================================================================= RLS ==
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.financial_years enable row level security;
alter table public.accounting_periods enable row level security;
alter table public.accounts enable row level security;

-- SECURITY DEFINER helper: avoids RLS self-recursion when a policy on
-- `profiles` needs to read the caller's own company_id.
create function public.get_my_company_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid();
$$;

-- companies: every authenticated user may create a company (bootstrapping —
-- there is no company to scope against until one exists); read/update/delete
-- scoped to the caller's own company thereafter.
create policy companies_insert_any_authenticated on public.companies
  for insert to authenticated with check (true);
create policy companies_select_own on public.companies
  for select to authenticated using (id = public.get_my_company_id());
create policy companies_update_own on public.companies
  for update to authenticated using (id = public.get_my_company_id());
create policy companies_delete_own on public.companies
  for delete to authenticated using (id = public.get_my_company_id());

-- profiles: a user always sees their own row, plus colleagues in the same company.
create policy profiles_select_self_or_company on public.profiles
  for select to authenticated using (id = auth.uid() or company_id = public.get_my_company_id());
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid());

-- financial_years / accounting_periods / accounts: standard same-company CRUD.
create policy financial_years_all_own_company on public.financial_years
  for all to authenticated
  using (company_id = public.get_my_company_id())
  with check (company_id = public.get_my_company_id());

create policy accounting_periods_all_own_company on public.accounting_periods
  for all to authenticated
  using (company_id = public.get_my_company_id())
  with check (company_id = public.get_my_company_id());

create policy accounts_all_own_company on public.accounts
  for all to authenticated
  using (company_id = public.get_my_company_id())
  with check (company_id = public.get_my_company_id());
