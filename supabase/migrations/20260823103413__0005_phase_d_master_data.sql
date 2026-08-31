-- Backfilled from supabase_migrations.schema_migrations (already applied to the live project).
-- version: 20260823103413 · name: 0005_phase_d_master_data


-- Phase D (docs/SUPABASE_MIGRATION_GUIDE.md): master data — Customers,
-- Suppliers, Products, Warehouses, BankAccounts, TaxRates, Employees. All
-- fully editable (standard IRepository CRUD, not append-only like Phase
-- C's ledger), so every table uses the same "ALL, own company" RLS shape
-- Phase B already established for accounts/accounting_periods/financial_years.

-- Shared across Customer/Supplier/Product/Warehouse/BankAccount — all five
-- domain types use the identical `ActiveStatus = 'active' | 'inactive'` union.
create type public.active_status as enum ('active', 'inactive');

create type public.customer_payment_terms as enum ('COD', 'Net14', 'Net30', 'Net60');
create type public.customer_tax_status as enum ('taxable', 'exempt', 'zero-rated');

create type public.supplier_payment_terms as enum ('Net14', 'Net30', 'EOM');
create type public.supplier_category as enum ('Raw Materials', 'Utilities', 'Trade Vendors', 'Services');
create type public.supplier_payment_method as enum ('EFT', 'Direct Debit', 'Credit Card');

create type public.product_type as enum ('good', 'service');
create type public.product_valuation_method as enum ('weighted_average', 'fifo');

create type public.bank_account_type as enum (
  'checking', 'savings', 'credit_card', 'cash', 'money_market', 'foreign_currency'
);

create type public.vat_treatment as enum (
  'standard_rated', 'zero_rated', 'exempt', 'out_of_scope',
  'capital_goods', 'import_vat', 'reverse_charge', 'non_deductible'
);
create type public.tax_applies_to as enum ('sales', 'purchases', 'both');

create type public.employment_type as enum ('permanent', 'fixed_term', 'part_time', 'temporary');
create type public.pay_frequency as enum ('monthly', 'weekly', 'biweekly');
create type public.employee_status as enum ('active', 'inactive', 'terminated');

-- tax_rates first: products.tax_rate_id references it.
create table public.tax_rates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  treatment public.vat_treatment not null,
  rate numeric(5, 2) not null,
  applies_to public.tax_applies_to not null,
  effective_from timestamptz not null,
  effective_to timestamptz,
  jurisdiction text not null,
  source_reference text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code, effective_from)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_number text not null,
  name text not null,
  email text,
  phone text,
  billing_address jsonb,
  shipping_address jsonb,
  tax_number text,
  currency text not null default 'ZAR',
  balance numeric(14, 2) not null default 0,
  status public.active_status not null default 'active',
  notes text,
  owner_user_id uuid references public.profiles(id) on delete set null,
  credit_limit numeric(14, 2),
  payment_terms public.customer_payment_terms,
  credit_hold boolean not null default false,
  tax_status public.customer_tax_status,
  default_discount_percent numeric(5, 2),
  -- CustomerContact[] (src/types/customer.ts) — small nested UI list, no
  -- independent relational need (nothing else references a single
  -- contact), same jsonb treatment as billing/shipping address.
  contacts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, customer_number)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_number text not null,
  name text not null,
  email text,
  phone text,
  address jsonb,
  tax_number text,
  currency text not null default 'ZAR',
  balance numeric(14, 2) not null default 0,
  status public.active_status not null default 'active',
  notes text,
  credit_limit numeric(14, 2),
  payment_terms public.supplier_payment_terms,
  category public.supplier_category,
  on_hold boolean not null default false,
  bank_details jsonb,
  contact_person text,
  remittance_address jsonb,
  payment_method public.supplier_payment_method,
  settlement_discount_percent numeric(5, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, supplier_number)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  sku text not null,
  name text not null,
  description text,
  type public.product_type not null,
  unit_price numeric(14, 2) not null default 0,
  cost_price numeric(14, 2) not null default 0,
  tax_rate_id uuid references public.tax_rates(id),
  track_inventory boolean not null default true,
  quantity_on_hand numeric(14, 3) not null default 0,
  reorder_level numeric(14, 3),
  status public.active_status not null default 'active',
  barcode text,
  uom text,
  category text,
  valuation_method public.product_valuation_method,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, sku)
);

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  code text not null,
  address jsonb,
  is_default boolean not null default false,
  status public.active_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  bank_name text not null,
  account_number text not null,
  account_type public.bank_account_type not null,
  currency text not null default 'ZAR',
  opening_balance numeric(14, 2) not null default 0,
  current_balance numeric(14, 2) not null default 0,
  gl_account_id uuid not null references public.accounts(id),
  status public.active_status not null default 'active',
  branch_code text,
  swift_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, account_number)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_number text not null,
  first_name text not null,
  last_name text not null,
  id_number text,
  tax_number text,
  date_of_birth date,
  email text,
  phone text,
  employment_type public.employment_type not null,
  pay_frequency public.pay_frequency not null,
  status public.employee_status not null default 'active',
  start_date date not null,
  termination_date date,
  basic_salary numeric(14, 2) not null default 0,
  standard_allowances jsonb not null default '[]'::jsonb,
  standard_deductions jsonb not null default '[]'::jsonb,
  bank_name text,
  bank_account_number text,
  uif_exempt boolean not null default false,
  currency text not null default 'ZAR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, employee_number)
);

-- Indexes on every FK an RLS policy or query filters on (Phase A convention).
create index tax_rates_company_id_idx on public.tax_rates (company_id);
create index customers_company_id_idx on public.customers (company_id);
create index customers_owner_user_id_idx on public.customers (owner_user_id);
create index suppliers_company_id_idx on public.suppliers (company_id);
create index products_company_id_idx on public.products (company_id);
create index products_tax_rate_id_idx on public.products (tax_rate_id);
create index warehouses_company_id_idx on public.warehouses (company_id);
create index bank_accounts_company_id_idx on public.bank_accounts (company_id);
create index bank_accounts_gl_account_id_idx on public.bank_accounts (gl_account_id);
create index employees_company_id_idx on public.employees (company_id);

alter table public.tax_rates enable row level security;
alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.warehouses enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.employees enable row level security;

create policy tax_rates_all_own_company on public.tax_rates for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));
create policy customers_all_own_company on public.customers for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));
create policy suppliers_all_own_company on public.suppliers for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));
create policy products_all_own_company on public.products for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));
create policy warehouses_all_own_company on public.warehouses for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));
create policy bank_accounts_all_own_company on public.bank_accounts for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));
create policy employees_all_own_company on public.employees for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));
