-- Backfilled from supabase_migrations.schema_migrations (already applied to the live project).
-- version: 20260823193034 · name: 0007_phase_f_fixed_assets_payroll_tax


-- Phase F (docs/SUPABASE_MIGRATION_GUIDE.md): Fixed Assets, Payroll, Tax.
-- 15 tables across three domains. Nested arrays/objects embedded on their
-- parent record (PayrollRun.payslips, TaxComputation.adjustments,
-- DeferredTaxComputation.items, EclComputation.buckets,
-- ProvisionalTaxPeriod's three payment slots) are jsonb columns, same
-- treatment Phase D/E already gave every other embedded-array domain type
-- — nothing in this codebase queries them at the SQL level, every
-- consumer reads the whole parent object.
--
-- Company-id resolution splits by what each TS type actually carries:
-- TaxComputation/ProvisionalTaxPeriod/DeferredTaxComputation/EclComputation
-- all have a real `companyId` field (like FinancialYear/AccountingPeriod,
-- Phase B) — their repositories take it directly from the entity. Every
-- other type here (FixedAsset, DepreciationEntry, AssetDisposal,
-- PayrollRun, PayrollTaxYearConfig, IncomeTaxYearConfig, DividendDeclaration,
-- DividendsWithholdingTaxRateConfig, CgtInclusionRateConfig,
-- CgtAnnualExclusionConfig, CgtDisposalAdjustment) has no companyId field
-- at all (like Account, Phase B) — their repositories resolve "the"
-- company internally via resolveDefaultCompanyId().

create type public.asset_category as enum (
  'land', 'buildings', 'plant_and_machinery', 'furniture_and_fittings',
  'motor_vehicles', 'computer_equipment', 'office_equipment',
  'leasehold_improvements', 'other'
);
create type public.depreciation_method as enum ('straight_line', 'reducing_balance');
create type public.fixed_asset_status as enum ('draft', 'active', 'fully_depreciated', 'disposed');
-- Shared by PayrollRun/TaxComputation/DeferredTaxComputation/EclComputation
-- — all four TS unions are the identical `'draft' | 'posted'`, same
-- draft-then-post lifecycle. One enum, not four near-duplicates.
create type public.draft_posted_status as enum ('draft', 'posted');
create type public.dividend_declaration_status as enum ('draft', 'declared', 'paid', 'remitted');
create type public.cgt_entity_type_bucket as enum ('natural_person_like', 'company', 'trust');

-- ============================= Fixed Assets =============================

create table public.fixed_assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  asset_number text not null,
  name text not null,
  description text,
  category public.asset_category not null,
  acquisition_date timestamptz not null,
  cost numeric(14, 2) not null,
  residual_value numeric(14, 2) not null default 0,
  useful_life_years numeric(6, 2) not null,
  depreciation_method public.depreciation_method not null,
  reducing_balance_rate_percent numeric(5, 2),
  gl_asset_account_id uuid not null references public.accounts(id),
  gl_accumulated_depreciation_account_id uuid not null references public.accounts(id),
  gl_depreciation_expense_account_id uuid not null references public.accounts(id),
  accumulated_depreciation numeric(14, 2) not null default 0,
  status public.fixed_asset_status not null default 'draft',
  journal_entry_id uuid references public.journal_entries(id),
  source_bill_id uuid references public.bills(id),
  tax_wear_tear_rate_percent numeric(5, 2),
  tax_wear_tear_rate_source text,
  disposal_date timestamptz,
  disposal_proceeds numeric(14, 2),
  disposal_journal_entry_id uuid references public.journal_entries(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, asset_number)
);

-- Append-only, same shape as Phase C's journal_lines / Phase E's stock_movements.
create table public.depreciation_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  asset_id uuid not null references public.fixed_assets(id),
  period_end timestamptz not null,
  amount numeric(14, 2) not null,
  accumulated_depreciation_after numeric(14, 2) not null,
  carrying_value_after numeric(14, 2) not null,
  journal_entry_id uuid not null references public.journal_entries(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.asset_disposals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  asset_id uuid not null references public.fixed_assets(id),
  disposal_date timestamptz not null,
  proceeds numeric(14, 2) not null,
  carrying_value_at_disposal numeric(14, 2) not null,
  accumulated_depreciation_at_disposal numeric(14, 2) not null,
  gain_loss numeric(14, 2) not null,
  journal_entry_id uuid not null references public.journal_entries(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================== Payroll ================================

create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  run_number text not null,
  pay_period_start timestamptz not null,
  pay_period_end timestamptz not null,
  pay_date timestamptz not null,
  status public.draft_posted_status not null default 'draft',
  payslips jsonb not null default '[]'::jsonb,
  journal_entry_id uuid references public.journal_entries(id),
  contra_account_id uuid references public.accounts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, run_number)
);

create table public.payroll_tax_year_configs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tax_year_label text not null,
  tax_year_start timestamptz not null,
  tax_year_end timestamptz not null,
  pay_brackets jsonb not null default '[]'::jsonb,
  primary_rebate_annual numeric(14, 2) not null default 0,
  secondary_rebate_annual numeric(14, 2) not null default 0,
  tertiary_rebate_annual numeric(14, 2) not null default 0,
  uif_employee_rate_percent numeric(5, 2) not null default 0,
  uif_employer_rate_percent numeric(5, 2) not null default 0,
  uif_monthly_ceiling numeric(14, 2) not null default 0,
  sdl_rate_percent numeric(5, 2) not null default 0,
  sdl_annual_payroll_exemption_threshold numeric(14, 2) not null default 0,
  source_reference text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, tax_year_label)
);

-- ================================ Tax ====================================

create table public.income_tax_year_configs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tax_year_label text not null,
  effective_from timestamptz not null,
  effective_to timestamptz not null,
  corporate_tax_rate_percent numeric(5, 2) not null,
  sbc_brackets jsonb not null default '[]'::jsonb,
  source_reference text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, tax_year_label)
);

create table public.tax_computations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  financial_year_id uuid not null references public.financial_years(id),
  financial_year_label text not null,
  status public.draft_posted_status not null default 'draft',
  accounting_profit numeric(14, 2) not null default 0,
  is_sbc_eligible boolean not null default false,
  adjustments jsonb not null default '[]'::jsonb,
  taxable_income numeric(14, 2) not null default 0,
  tax_config_id uuid not null references public.income_tax_year_configs(id),
  tax_config_tax_year_label text not null,
  tax_liability numeric(14, 2) not null default 0,
  journal_entry_id uuid references public.journal_entries(id),
  posted_at timestamptz,
  -- Not a uuid/FK: this app has no real auth session yet, callers still
  -- fall back to the SYSTEM_USER_ID sentinel (same reasoning as
  -- audit_log_entries.user_id, Phase C).
  posted_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, financial_year_id)
);

create table public.provisional_tax_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  financial_year_id uuid not null references public.financial_years(id),
  financial_year_label text not null,
  first_slot jsonb not null,
  second_slot jsonb not null,
  top_up_slot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, financial_year_id)
);

create table public.deferred_tax_computations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  financial_year_id uuid not null references public.financial_years(id),
  financial_year_label text not null,
  as_of_date timestamptz not null,
  status public.draft_posted_status not null default 'draft',
  tax_rate_percent numeric(5, 2) not null,
  tax_config_id uuid not null references public.income_tax_year_configs(id),
  tax_config_tax_year_label text not null,
  items jsonb not null default '[]'::jsonb,
  total_deferred_tax_liability numeric(14, 2) not null default 0,
  total_deferred_tax_asset numeric(14, 2) not null default 0,
  net_deferred_tax_liability numeric(14, 2) not null default 0,
  prior_net_deferred_tax_liability numeric(14, 2),
  movement_amount numeric(14, 2),
  journal_entry_id uuid references public.journal_entries(id),
  posted_at timestamptz,
  posted_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, financial_year_id)
);

create table public.dividend_declarations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  declaration_date timestamptz not null,
  total_amount numeric(14, 2) not null,
  exempt_portion numeric(14, 2) not null default 0,
  exemption_reason text,
  status public.dividend_declaration_status not null default 'draft',
  taxable_amount numeric(14, 2) not null default 0,
  rate_percent_applied numeric(5, 2) not null default 0,
  dividends_tax_withheld numeric(14, 2) not null default 0,
  net_payable_to_shareholders numeric(14, 2) not null default 0,
  declaration_journal_entry_id uuid references public.journal_entries(id),
  payment_journal_entry_id uuid references public.journal_entries(id),
  paid_date timestamptz,
  remittance_journal_entry_id uuid references public.journal_entries(id),
  remitted_date timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dividends_withholding_tax_configs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rate_percent numeric(5, 2) not null,
  effective_from timestamptz not null,
  source_reference text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, effective_from)
);

create table public.cgt_inclusion_rate_configs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entity_type_bucket public.cgt_entity_type_bucket not null,
  inclusion_rate_percent numeric(5, 2) not null,
  effective_from timestamptz not null,
  effective_to timestamptz,
  source_reference text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, entity_type_bucket, effective_from)
);

create table public.cgt_annual_exclusion_configs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  amount numeric(14, 2) not null,
  effective_from timestamptz not null,
  effective_to timestamptz,
  source_reference text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, effective_from)
);

create table public.cgt_disposal_adjustments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  disposal_id uuid not null references public.asset_disposals(id),
  selling_costs numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, disposal_id)
);

create table public.ecl_computations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  financial_year_id uuid not null references public.financial_years(id),
  financial_year_label text not null,
  as_of_date timestamptz not null,
  status public.draft_posted_status not null default 'draft',
  buckets jsonb not null default '[]'::jsonb,
  total_gross_receivable numeric(14, 2) not null default 0,
  total_expected_credit_loss numeric(14, 2) not null default 0,
  prior_total_expected_credit_loss numeric(14, 2),
  movement_amount numeric(14, 2),
  journal_entry_id uuid references public.journal_entries(id),
  posted_at timestamptz,
  posted_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, financial_year_id)
);

-- ================================ Indexes ================================

create index fixed_assets_company_id_idx on public.fixed_assets (company_id);
create index fixed_assets_source_bill_id_idx on public.fixed_assets (source_bill_id);
create index depreciation_entries_company_id_idx on public.depreciation_entries (company_id);
create index depreciation_entries_asset_id_idx on public.depreciation_entries (asset_id);
create index asset_disposals_company_id_idx on public.asset_disposals (company_id);
create index asset_disposals_asset_id_idx on public.asset_disposals (asset_id);
create index payroll_runs_company_id_idx on public.payroll_runs (company_id);
create index payroll_tax_year_configs_company_id_idx on public.payroll_tax_year_configs (company_id);
create index income_tax_year_configs_company_id_idx on public.income_tax_year_configs (company_id);
create index tax_computations_company_id_idx on public.tax_computations (company_id);
create index tax_computations_financial_year_id_idx on public.tax_computations (financial_year_id);
create index tax_computations_tax_config_id_idx on public.tax_computations (tax_config_id);
create index provisional_tax_periods_company_id_idx on public.provisional_tax_periods (company_id);
create index provisional_tax_periods_financial_year_id_idx on public.provisional_tax_periods (financial_year_id);
create index deferred_tax_computations_company_id_idx on public.deferred_tax_computations (company_id);
create index deferred_tax_computations_financial_year_id_idx on public.deferred_tax_computations (financial_year_id);
create index deferred_tax_computations_tax_config_id_idx on public.deferred_tax_computations (tax_config_id);
create index dividend_declarations_company_id_idx on public.dividend_declarations (company_id);
create index dividends_withholding_tax_configs_company_id_idx on public.dividends_withholding_tax_configs (company_id);
create index cgt_inclusion_rate_configs_company_id_idx on public.cgt_inclusion_rate_configs (company_id);
create index cgt_annual_exclusion_configs_company_id_idx on public.cgt_annual_exclusion_configs (company_id);
create index cgt_disposal_adjustments_company_id_idx on public.cgt_disposal_adjustments (company_id);
create index cgt_disposal_adjustments_disposal_id_idx on public.cgt_disposal_adjustments (disposal_id);
create index ecl_computations_company_id_idx on public.ecl_computations (company_id);
create index ecl_computations_financial_year_id_idx on public.ecl_computations (financial_year_id);

-- ================================== RLS ===================================

alter table public.fixed_assets enable row level security;
alter table public.depreciation_entries enable row level security;
alter table public.asset_disposals enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_tax_year_configs enable row level security;
alter table public.income_tax_year_configs enable row level security;
alter table public.tax_computations enable row level security;
alter table public.provisional_tax_periods enable row level security;
alter table public.deferred_tax_computations enable row level security;
alter table public.dividend_declarations enable row level security;
alter table public.dividends_withholding_tax_configs enable row level security;
alter table public.cgt_inclusion_rate_configs enable row level security;
alter table public.cgt_annual_exclusion_configs enable row level security;
alter table public.cgt_disposal_adjustments enable row level security;
alter table public.ecl_computations enable row level security;

create policy fixed_assets_all_own_company on public.fixed_assets for all to authenticated
  using (company_id = (select public.get_my_company_id())) with check (company_id = (select public.get_my_company_id()));
create policy payroll_runs_all_own_company on public.payroll_runs for all to authenticated
  using (company_id = (select public.get_my_company_id())) with check (company_id = (select public.get_my_company_id()));
create policy payroll_tax_year_configs_all_own_company on public.payroll_tax_year_configs for all to authenticated
  using (company_id = (select public.get_my_company_id())) with check (company_id = (select public.get_my_company_id()));
create policy income_tax_year_configs_all_own_company on public.income_tax_year_configs for all to authenticated
  using (company_id = (select public.get_my_company_id())) with check (company_id = (select public.get_my_company_id()));
create policy tax_computations_all_own_company on public.tax_computations for all to authenticated
  using (company_id = (select public.get_my_company_id())) with check (company_id = (select public.get_my_company_id()));
create policy provisional_tax_periods_all_own_company on public.provisional_tax_periods for all to authenticated
  using (company_id = (select public.get_my_company_id())) with check (company_id = (select public.get_my_company_id()));
create policy deferred_tax_computations_all_own_company on public.deferred_tax_computations for all to authenticated
  using (company_id = (select public.get_my_company_id())) with check (company_id = (select public.get_my_company_id()));
create policy dividend_declarations_all_own_company on public.dividend_declarations for all to authenticated
  using (company_id = (select public.get_my_company_id())) with check (company_id = (select public.get_my_company_id()));
create policy dividends_withholding_tax_configs_all_own_company on public.dividends_withholding_tax_configs for all to authenticated
  using (company_id = (select public.get_my_company_id())) with check (company_id = (select public.get_my_company_id()));
create policy cgt_inclusion_rate_configs_all_own_company on public.cgt_inclusion_rate_configs for all to authenticated
  using (company_id = (select public.get_my_company_id())) with check (company_id = (select public.get_my_company_id()));
create policy cgt_annual_exclusion_configs_all_own_company on public.cgt_annual_exclusion_configs for all to authenticated
  using (company_id = (select public.get_my_company_id())) with check (company_id = (select public.get_my_company_id()));
create policy cgt_disposal_adjustments_all_own_company on public.cgt_disposal_adjustments for all to authenticated
  using (company_id = (select public.get_my_company_id())) with check (company_id = (select public.get_my_company_id()));
create policy ecl_computations_all_own_company on public.ecl_computations for all to authenticated
  using (company_id = (select public.get_my_company_id())) with check (company_id = (select public.get_my_company_id()));

-- Append-only (SELECT/INSERT only), same pattern as journal_lines/stock_movements.
create policy depreciation_entries_select_own_company on public.depreciation_entries for select to authenticated
  using (company_id = (select public.get_my_company_id()));
create policy depreciation_entries_insert_own_company on public.depreciation_entries for insert to authenticated
  with check (company_id = (select public.get_my_company_id()));
create policy asset_disposals_select_own_company on public.asset_disposals for select to authenticated
  using (company_id = (select public.get_my_company_id()));
create policy asset_disposals_insert_own_company on public.asset_disposals for insert to authenticated
  with check (company_id = (select public.get_my_company_id()));

revoke update, delete, truncate on public.depreciation_entries from anon, authenticated;
revoke update, delete, truncate on public.asset_disposals from anon, authenticated;
revoke all on public.depreciation_entries from anon;
revoke all on public.asset_disposals from anon;
