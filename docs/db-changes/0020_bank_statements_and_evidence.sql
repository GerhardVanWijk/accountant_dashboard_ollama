-- 0020_bank_statements_and_evidence
-- Adds a first-class bank-statement entity and structured reconciliation evidence:
--   * bank_statements        — one imported statement (mutable; import + reconciliation
--                              status are a real lifecycle, not an append-only snapshot).
--   * bank_statement_lines   — the individual lines of a statement, with the metadata a
--                              real statement line carries (sequence, value_date,
--                              running_balance, external_ref_id, raw_source, line_state).
--   * bank_transactions.bank_statement_line_id — additive nullable link from an existing
--                              ledger-side bank transaction to the statement line it came
--                              from / was matched to.
--   * reconciliation_issues.evidence_data (jsonb) + dedupe_key — the raw numbers each
--                              detector computes, kept as data instead of prose, plus a
--                              deterministic idempotency key to fix the broken supersede.
--   * products.cost_price widened numeric(14,2) -> numeric(14,4) for 4dp weighted-average
--                              cost (user decision 3).
--
-- No existing column is dropped or narrowed. The 94 bank_transactions rows and 50
-- products rows keep working unchanged; widening cost_price is loss-free (all 50 values
-- verified identical after the ALTER, 0 nulls, sum 43770.20 unchanged).
--
-- RLS: both new tables get a single "own company" ALL policy, role authenticated,
-- company_id = (select get_my_company_id()) — the same shape as public.fixed_assets'
-- fixed_assets_all_own_company (Postgres normalises the predicate to
-- `(company_id = ( SELECT get_my_company_id() AS get_my_company_id))`). New tables use
-- {authenticated}, not the {public} that reconciliations / reconciliation_issues use
-- (Agent 11 audit, decision 4).
--
-- Every FK added here has a covering index (Supabase perf-linter 0001).
--
-- Project bcaffvpibpitpuqglszn, BANK_STATEMENT_RECONCILIATION_AND_FORM_SYSTEM sub-phase P1.1.
-- APPLIED LIVE 2026-08-28 via Supabase MCP apply_migration, migration `0020_bank_statements_and_evidence`.
-- Post-apply advisors: only NEW entries are 8 `unused_index` INFO notices for the brand-new indexes
-- (clear on first query) + 2 `auth_allow_anonymous_sign_ins` WARN on the new tables (identical to every
-- other `_all_own_company` table). No security ERROR, no missing-RLS, no new unindexed-FK, no new
-- multiple-permissive-policies. cost_price widened numeric(14,2)->(14,4), all 50 values intact (sum
-- 43770.20 unchanged, 0 nulls).

-- 1. enums
create type bank_statement_import_status as enum ('draft','parsed','imported','failed','reversed');
create type bank_statement_recon_status  as enum ('not_started','in_progress','reconciled');
create type bank_statement_line_state    as enum ('unmatched','matched','explained','ignored');

-- 2. bank_statements (mutable; import/recon status is a real lifecycle)
create table public.bank_statements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts(id),
  reference text,
  source_filename text,
  source_format text,                    -- 'csv' | 'ofx' | 'qif' | 'mt940' | 'manual'
  period_start timestamptz not null,
  period_end   timestamptz not null,
  opening_balance numeric not null,
  closing_balance numeric not null,
  currency text not null default 'ZAR',
  line_count integer not null default 0,
  import_status bank_statement_import_status not null default 'draft',
  reconciliation_status bank_statement_recon_status not null default 'not_started',
  content_hash text,
  imported_at timestamptz,
  imported_by text,                      -- text, matches reconciliations.finalized_by_user_id
  balance_check_ok boolean,              -- null = not checked; true/false = opening+net==closing
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_statements_content_hash_unique unique (company_id, bank_account_id, content_hash)
);

-- 3. bank_statement_lines
create table public.bank_statement_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  bank_statement_id uuid not null references public.bank_statements(id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts(id),
  sequence integer not null,
  txn_date timestamptz not null,
  value_date timestamptz,
  description text not null,
  reference text,
  external_ref_id text,                  -- OFX FITID / MT940 ref / CSV row id
  amount numeric not null,               -- magnitude
  direction debit_credit not null,       -- reuse existing enum (debit = inflow, per codebase convention)
  running_balance numeric,
  raw_source jsonb not null default '{}',
  line_state bank_statement_line_state not null default 'unmatched',
  matched_bank_transaction_id uuid references public.bank_transactions(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index bank_statement_lines_external_ref_unique
  on public.bank_statement_lines (bank_account_id, external_ref_id)
  where external_ref_id is not null;

-- 4. additive link column
alter table public.bank_transactions
  add column bank_statement_line_id uuid references public.bank_statement_lines(id);

-- 5. structured evidence + dedupe key on reconciliation_issues
alter table public.reconciliation_issues
  add column evidence_data jsonb not null default '{}'::jsonb,
  add column dedupe_key text;
create index reconciliation_issues_dedupe_key_idx on public.reconciliation_issues (dedupe_key);

-- 6. cost_price precision (user decision 3: 4dp WAC)
alter table public.products alter column cost_price type numeric(14,4);

-- 7. RLS
alter table public.bank_statements enable row level security;
alter table public.bank_statement_lines enable row level security;
create policy bank_statements_all_own_company on public.bank_statements
  for all
  to authenticated
  using (company_id = ( select get_my_company_id() as get_my_company_id))
  with check (company_id = ( select get_my_company_id() as get_my_company_id));
create policy bank_statement_lines_all_own_company on public.bank_statement_lines
  for all
  to authenticated
  using (company_id = ( select get_my_company_id() as get_my_company_id))
  with check (company_id = ( select get_my_company_id() as get_my_company_id));

-- 8. indexes (company_id + bank_account_id predicate/FK coverage on both tables,
--    statement_id child lookup, matched-transaction + link-column FK coverage)
create index bank_statements_company_id_idx           on public.bank_statements (company_id);
create index bank_statements_bank_account_id_idx      on public.bank_statements (bank_account_id);
create index bank_statement_lines_company_id_idx      on public.bank_statement_lines (company_id);
create index bank_statement_lines_statement_id_idx    on public.bank_statement_lines (bank_statement_id);
create index bank_statement_lines_bank_account_id_idx on public.bank_statement_lines (bank_account_id);
create index bank_statement_lines_matched_bt_idx      on public.bank_statement_lines (matched_bank_transaction_id);
create index bank_transactions_statement_line_idx     on public.bank_transactions (bank_statement_line_id);
