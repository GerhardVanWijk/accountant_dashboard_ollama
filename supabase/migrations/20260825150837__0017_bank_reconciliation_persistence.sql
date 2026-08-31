-- Backfilled from supabase_migrations.schema_migrations (already applied to the live project).
-- version: 20260825150837 · name: 0017_bank_reconciliation_persistence


-- Reconciliation persistence (docs/SUPABASE_MIGRATION_GUIDE.md convention).
-- Mirrors BankReconciliation (src/features/banking/types/bankReconciliation.ts)
-- field-for-field. Append-only: same shape as journal_entries/journal_lines/
-- stock_movements (Phase C/E) -- SELECT/INSERT RLS only, no update()/delete()
-- on the repository interface, matching grants revoked to prove it at the DB
-- layer too, not just in application code.

create table public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts(id),
  statement_date timestamptz not null,
  statement_balance numeric not null,
  gl_cashbook_balance numeric not null,
  adjusted_bank_balance numeric not null,
  variance numeric not null,
  cleared_transaction_ids jsonb not null default '[]'::jsonb,
  unpresented_transaction_ids jsonb not null default '[]'::jsonb,
  uncleared_deposit_ids jsonb not null default '[]'::jsonb,
  finalized_at timestamptz not null,
  -- text, not uuid/FK: mirrors audit_log_entries.user_id (Phase C). The real
  -- finalizedByUserId argument passed today is journalEntryService's
  -- SYSTEM_USER_ID = 'system' sentinel (src/features/banking/hooks/
  -- useBankReconciliation.ts is not yet wired to a real authenticated user
  -- id) -- not a valid uuid, so a strict uuid/FK column would make every
  -- real finalize() call in the running app throw immediately.
  finalized_by_user_id text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Matches the existing repository access patterns: getByAccount() filters on
-- bank_account_id; every RLS policy below filters on company_id (the same
-- convention every company-scoped table already carries an index for).
create index reconciliations_company_id_idx on public.reconciliations using btree (company_id);
create index reconciliations_bank_account_id_idx on public.reconciliations using btree (bank_account_id);

alter table public.reconciliations enable row level security;

create policy reconciliations_select_own_company
  on public.reconciliations for select
  using (company_id = (select public.get_my_company_id()));

create policy reconciliations_insert_own_company
  on public.reconciliations for insert
  with check (company_id = (select public.get_my_company_id()));

-- No update/delete policy exists at all -- RLS denies those commands
-- outright. Grants revoked next as defense-in-depth, same two-layer
-- discipline as journal_entries/journal_lines/stock_movements (Phase C/E):
-- this project's ALTER DEFAULT PRIVILEGES auto-grants UPDATE/DELETE/TRUNCATE
-- (and everything else) to anon/authenticated on every new table.
revoke all on public.reconciliations from anon;
revoke update, delete, truncate on public.reconciliations from authenticated;

-- bank_transactions.reconciliation_id -> reconciliations.id. Safe to add now
-- (not before): BankReconciliationService.finalizeReconciliation() already
-- unconditionally writes bankTransactionRepository.update(id, {
-- reconciliationId: record.id }) for every cleared transaction immediately
-- after creating the reconciliation snapshot, and bankTransactionRepository
-- is already SupabaseBankTransactionRepository -- so every real finalize
-- from here on populates this column consistently, always with the just-
-- created row's real id (never a stale/guessed value). Verified 0 existing
-- bank_transactions rows carry a non-null reconciliation_id today, so this
-- adds no risk of breaking existing data. NO ACTION (no ON DELETE clause),
-- matching every other same-shape reference FK in this schema (transfer_pair_id,
-- journal_entry_id on bank_transactions) rather than the CASCADE reserved for
-- company_id FKs only.
alter table public.bank_transactions
  add constraint bank_transactions_reconciliation_id_fkey
  foreign key (reconciliation_id) references public.reconciliations(id);
