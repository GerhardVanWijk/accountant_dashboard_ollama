-- 0060_financial_plan_lines
-- Whole-project completion audit, Part 11 (Forecasting / Budget vs Actual —
-- previously entirely absent, docs/CURRENT_TASKS.md "NEXT" list).
--
-- Pure PLANNING data — Budget and (Current) Forecast figures per company /
-- GL account / calendar month. Deliberately NEVER posts to the ledger:
-- no journal_entries/journal_lines row is ever created from this table, no
-- RPC touches post_inventory_transaction or any posting engine. "Actual" is
-- NOT stored here at all — it is computed on demand from the EXISTING
-- journal_lines/journal_entries tables (the same source every other
-- financial report already reads), so there is no second, driftable copy
-- of the ledger truth.
--
-- SCOPE DECISION (explicit, per the brief's own "distinguish Budget /
-- Current Forecast" instruction, not over-engineered into full version
-- history): `plan_type` is a two-value enum, `budget` and `forecast`. There
-- is exactly ONE row per (company, plan_type, account, year, month) — a
-- forecast revision simply overwrites the prior figure for that
-- account/month (an UPDATE, via the repository's upsert), the same "current
-- state, not a history" model every other master-data table in this schema
-- already uses (e.g. `products.cost_price`). A full budget/forecast
-- versioning history (named scenarios, approval workflow, snapshots) is
-- deliberately out of scope for this pass.
--
-- COMPANY SAFETY: `account_id` is a COMPOSITE FK to `accounts(company_id, id)`
-- from the FIRST migration (accounts already carries the `(company_id, id)`
-- candidate key) — a cross-company account reference is structurally
-- impossible, matching every other document table's own convention.

create type public.financial_plan_type as enum ('budget', 'forecast');

create table public.financial_plan_lines (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  plan_type     public.financial_plan_type not null,
  account_id    uuid not null,
  period_year   integer not null,
  period_month  integer not null check (period_month between 1 and 12),
  amount        numeric not null default 0,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (company_id, plan_type, account_id, period_year, period_month),
  foreign key (company_id, account_id) references public.accounts (company_id, id)
);

create index financial_plan_lines_company_id_idx on public.financial_plan_lines (company_id);
create index financial_plan_lines_lookup_idx on public.financial_plan_lines (company_id, plan_type, period_year, period_month);
create index financial_plan_lines_account_id_idx on public.financial_plan_lines (account_id);

alter table public.financial_plan_lines enable row level security;

create policy financial_plan_lines_all_own_company on public.financial_plan_lines
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));
