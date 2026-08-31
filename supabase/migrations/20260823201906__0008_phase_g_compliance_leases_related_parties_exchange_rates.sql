-- Backfilled from supabase_migrations.schema_migrations (already applied to the live project).
-- version: 20260823201906 · name: 0008_phase_g_compliance_leases_related_parties_exchange_rates

-- Phase G: Compliance (Public Interest Score), Leases, Related Parties,
-- Exchange Rates, Reporting Standards.
-- Columns below are derived from the real TS types (src/types/compliance.ts,
-- lease.ts, relatedParty.ts, reportingStandard.ts, foreignExchange.ts) as
-- read directly from the repo, not from the dispatch's proposed column list
-- (see migration guide entry for the corrections made).

-- ============================================================
-- New enum types
-- ============================================================

create type public.audit_assurance_level as enum ('audit_required', 'independent_review_required');
create type public.reporting_framework_confidence as enum ('high', 'requires_professional_review');
create type public.lease_status as enum ('draft', 'active', 'terminated');
create type public.related_party_relationship_type as enum (
  'director', 'shareholder', 'subsidiary', 'associate', 'key_management', 'other_related_entity'
);
-- Deliberately NOT a subset of the existing `reporting_framework` enum (which
-- also has other_sa_framework/grap/not_yet_determined) -- ReportingStandardVersion.standard
-- is its own narrower 2-value union in src/types/reportingStandard.ts.
create type public.reporting_standard_name as enum ('full_ifrs', 'ifrs_for_smes');

-- ============================================================
-- 1. public_interest_scores (APPEND-ONLY)
-- ============================================================

create table public.public_interest_scores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  financial_year_id uuid not null references public.financial_years(id) on delete cascade,
  -- PublicInterestScoreComponents, embedded as jsonb per committed design:
  -- { averageEmployees, turnover, thirdPartyLiabilities, shareholdersOrMembersCount }
  components jsonb not null,
  employee_points numeric(10, 2) not null,
  turnover_points numeric(10, 2) not null,
  third_party_liability_points numeric(10, 2) not null,
  shareholder_points numeric(10, 2) not null,
  total_score numeric(10, 2) not null,
  holds_fiduciary_assets_over_threshold boolean not null default false,
  financial_statements_compilation public.financial_statement_compilation,
  suggested_assurance_level public.audit_assurance_level not null,
  assurance_level_reason text not null,
  suggested_reporting_framework public.reporting_framework not null,
  reporting_framework_confidence public.reporting_framework_confidence not null,
  reporting_framework_reason text not null,
  framework_differs_from_current boolean not null,
  calculated_at timestamptz not null,
  calculated_by uuid not null references public.profiles(id),
  source_reference text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index public_interest_scores_company_id_idx on public.public_interest_scores(company_id);
create index public_interest_scores_financial_year_id_idx on public.public_interest_scores(financial_year_id);

alter table public.public_interest_scores enable row level security;

create policy public_interest_scores_select_own_company on public.public_interest_scores
  for select using (company_id = (select public.get_my_company_id()));

create policy public_interest_scores_insert_own_company on public.public_interest_scores
  for insert with check (company_id = (select public.get_my_company_id()));

revoke all on public.public_interest_scores from anon;
revoke update, delete, truncate on public.public_interest_scores from authenticated;

-- ============================================================
-- 2. lease_contracts (FULL CRUD)
-- ============================================================

create table public.lease_contracts (
  id uuid primary key default gen_random_uuid(),
  -- LeaseContract.companyId is optional on the TS type ("mirrors FixedAsset's
  -- lack of a companyId") -- resolved internally via resolveDefaultCompanyId(),
  -- NOT NULL here same as accounts/fixed_assets.
  company_id uuid not null references public.companies(id) on delete cascade,
  lease_number text not null,
  lessor_name text not null,
  asset_description text not null,
  commencement_date date not null,
  lease_term_months int not null,
  monthly_payment numeric(14, 2) not null,
  discount_rate_percent numeric(6, 3) not null,
  status public.lease_status not null default 'draft',
  initial_lease_liability numeric(14, 2) not null,
  initial_right_of_use_asset numeric(14, 2) not null,
  accumulated_depreciation numeric(14, 2) not null default 0,
  outstanding_lease_liability numeric(14, 2) not null default 0,
  -- Nullable: only set once leaseService.postCommencement() posts the
  -- capitalization entry -- a 'draft' lease has no journal entry yet.
  journal_entry_id uuid references public.journal_entries(id),
  termination_date date,
  termination_journal_entry_id uuid references public.journal_entries(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lease_contracts_company_id_idx on public.lease_contracts(company_id);

alter table public.lease_contracts enable row level security;

create policy lease_contracts_all_own_company on public.lease_contracts
  for all using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

-- ============================================================
-- 3. lease_amortization_entries (APPEND-ONLY)
-- ============================================================

create table public.lease_amortization_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lease_id uuid not null references public.lease_contracts(id) on delete cascade,
  period_end date not null,
  interest_amount numeric(14, 2) not null,
  principal_amount numeric(14, 2) not null,
  depreciation_amount numeric(14, 2) not null,
  outstanding_lease_liability_after numeric(14, 2) not null,
  accumulated_depreciation_after numeric(14, 2) not null,
  journal_entry_id uuid not null references public.journal_entries(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lease_amortization_entries_company_id_idx on public.lease_amortization_entries(company_id);
create index lease_amortization_entries_lease_id_idx on public.lease_amortization_entries(lease_id);

alter table public.lease_amortization_entries enable row level security;

create policy lease_amortization_entries_select_own_company on public.lease_amortization_entries
  for select using (company_id = (select public.get_my_company_id()));

create policy lease_amortization_entries_insert_own_company on public.lease_amortization_entries
  for insert with check (company_id = (select public.get_my_company_id()));

revoke all on public.lease_amortization_entries from anon;
revoke update, delete, truncate on public.lease_amortization_entries from authenticated;

-- ============================================================
-- 4. related_parties (FULL CRUD)
-- ============================================================

create table public.related_parties (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  relationship_type public.related_party_relationship_type not null,
  relationship_detail text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index related_parties_company_id_idx on public.related_parties(company_id);

alter table public.related_parties enable row level security;

create policy related_parties_all_own_company on public.related_parties
  for all using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

-- ============================================================
-- 5. related_party_transactions (FULL CRUD)
-- ============================================================

create table public.related_party_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  related_party_id uuid not null references public.related_parties(id) on delete cascade,
  transaction_date date not null,
  -- Free text by design -- RelatedPartyTransaction.natureOfTransaction has no
  -- fixed enum in the TS type; its doc comment explicitly rejects a closed
  -- taxonomy ("too varied ... guessing would violate SA_ACCOUNTING_MASTER_SPEC §110").
  nature_of_transaction text not null,
  amount numeric(14, 2) not null,
  description text,
  -- Free text, NOT a real FK -- explicitly documented as informational only.
  source_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index related_party_transactions_company_id_idx on public.related_party_transactions(company_id);
create index related_party_transactions_related_party_id_idx on public.related_party_transactions(related_party_id);

alter table public.related_party_transactions enable row level security;

create policy related_party_transactions_all_own_company on public.related_party_transactions
  for all using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

-- ============================================================
-- 6. reporting_standard_versions (FULL CRUD -- mutable per committed decision,
--    matches IReportingStandardVersionRepository's actual IRepository<T> contract)
-- ============================================================

create table public.reporting_standard_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  standard public.reporting_standard_name not null,
  version_label text not null,
  effective_from date not null,
  early_adoption_permitted boolean not null default false,
  superseded_by_version_id uuid references public.reporting_standard_versions(id),
  source_reference text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reporting_standard_versions_company_id_idx on public.reporting_standard_versions(company_id);

alter table public.reporting_standard_versions enable row level security;

create policy reporting_standard_versions_all_own_company on public.reporting_standard_versions
  for all using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

-- ============================================================
-- 7. exchange_rates (FULL CRUD)
-- ============================================================

create table public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  from_currency text not null,
  to_currency text not null,
  rate numeric(18, 6) not null,
  rate_date date not null,
  source_reference text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index exchange_rates_company_id_idx on public.exchange_rates(company_id);
-- Supports ExchangeRateService.getRateForDate(): most recent rate <= date
-- for a given currency pair.
create index exchange_rates_pair_date_idx
  on public.exchange_rates(company_id, from_currency, to_currency, rate_date desc);

alter table public.exchange_rates enable row level security;

create policy exchange_rates_all_own_company on public.exchange_rates
  for all using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));
