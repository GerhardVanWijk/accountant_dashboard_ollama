-- Backfilled from supabase_migrations.schema_migrations (already applied to the live project).
-- version: 20260828114433 · name: 0020_bank_statements_and_evidence

-- 1. enums
create type bank_statement_import_status as enum ('draft','parsed','imported','failed','reversed');
create type bank_statement_recon_status  as enum ('not_started','in_progress','reconciled');
create type bank_statement_line_state    as enum ('unmatched','matched','explained','ignored');

-- 2. bank_statements
create table public.bank_statements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts(id),
  reference text,
  source_filename text,
  source_format text,
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
  imported_by text,
  balance_check_ok boolean,
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
  external_ref_id text,
  amount numeric not null,
  direction debit_credit not null,
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

-- 5. structured evidence + dedupe key
alter table public.reconciliation_issues
  add column evidence_data jsonb not null default '{}'::jsonb,
  add column dedupe_key text;
create index reconciliation_issues_dedupe_key_idx on public.reconciliation_issues (dedupe_key);

-- 6. cost_price precision
alter table public.products alter column cost_price type numeric(14,4);

-- 7. RLS
alter table public.bank_statements enable row level security;
alter table public.bank_statement_lines enable row level security;
create policy bank_statements_all_own_company on public.bank_statements
  for all to authenticated
  using (company_id = ( select get_my_company_id() as get_my_company_id))
  with check (company_id = ( select get_my_company_id() as get_my_company_id));
create policy bank_statement_lines_all_own_company on public.bank_statement_lines
  for all to authenticated
  using (company_id = ( select get_my_company_id() as get_my_company_id))
  with check (company_id = ( select get_my_company_id() as get_my_company_id));

-- 8. indexes
create index bank_statements_company_id_idx           on public.bank_statements (company_id);
create index bank_statements_bank_account_id_idx      on public.bank_statements (bank_account_id);
create index bank_statement_lines_company_id_idx      on public.bank_statement_lines (company_id);
create index bank_statement_lines_statement_id_idx    on public.bank_statement_lines (bank_statement_id);
create index bank_statement_lines_bank_account_id_idx on public.bank_statement_lines (bank_account_id);
create index bank_statement_lines_matched_bt_idx      on public.bank_statement_lines (matched_bank_transaction_id);
create index bank_transactions_statement_line_idx     on public.bank_transactions (bank_statement_line_id);