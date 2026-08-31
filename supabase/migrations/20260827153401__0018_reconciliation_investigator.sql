-- Backfilled from supabase_migrations.schema_migrations (already applied to the live project).
-- version: 20260827153401 · name: 0018_reconciliation_investigator


create type reconciliation_issue_type as enum (
  'date_offset_timing',
  'amount_mismatch',
  'transposition_error',
  'duplicate_transaction',
  'missing_bank_side',
  'missing_ledger_side',
  'grouped_match',
  'combination_match',
  'wrong_sign',
  'wrong_bank_account',
  'vat_difference',
  'rounding_variance',
  'opening_balance_discrepancy',
  'edited_after_reconciliation'
);

create type reconciliation_issue_severity as enum ('info', 'low', 'medium', 'high', 'critical');

create type reconciliation_issue_status as enum ('open', 'reviewed', 'dismissed', 'resolved');

create table public.reconciliation_issues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  bank_account_id uuid not null references public.bank_accounts(id),
  statement_date timestamptz not null,
  issue_type reconciliation_issue_type not null,
  severity reconciliation_issue_severity not null,
  confidence integer not null check (confidence >= 0 and confidence <= 100),
  effect_amount numeric not null,
  affected_date_from timestamptz,
  affected_date_to timestamptz,
  related_bank_transaction_ids uuid[] not null default '{}',
  related_journal_entry_ids uuid[] not null default '{}',
  related_source_document_ids uuid[] not null default '{}',
  explanation text not null,
  evidence jsonb not null default '[]',
  suggested_resolution text not null,
  auto_resolution_safe boolean not null default false,
  status reconciliation_issue_status not null default 'open',
  -- Same reasoning as reconciliations.finalized_by_user_id / audit_log_entries.user_id:
  -- this app has no real authenticated-user session yet, so the value passed today is
  -- journalEntryService.SYSTEM_USER_ID = 'system', not a valid uuid.
  resolution_actor_user_id text,
  resolution_date timestamptz,
  resolution_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reconciliation_issues_company_id_idx on public.reconciliation_issues(company_id);
create index reconciliation_issues_bank_account_id_idx on public.reconciliation_issues(bank_account_id);
create index reconciliation_issues_status_idx on public.reconciliation_issues(status);

alter table public.reconciliation_issues enable row level security;

-- Mutable CRUD, same "ALL, own company" shape as fixed_assets (status transitions
-- open/reviewed/dismissed/resolved are a real lifecycle, not append-only history —
-- see IReconciliationIssueRepository's doc comment; the durable audit trail lives in
-- audit_log_entries via every resolution-service status change instead).
create policy reconciliation_issues_all_own_company on public.reconciliation_issues
  for all
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));
