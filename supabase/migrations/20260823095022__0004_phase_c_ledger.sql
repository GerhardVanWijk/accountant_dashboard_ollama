-- Backfilled from supabase_migrations.schema_migrations (already applied to the live project).
-- version: 20260823095022 · name: 0004_phase_c_ledger


-- Phase C (docs/SUPABASE_MIGRATION_GUIDE.md): append-only ledger + audit log.

create type public.journal_entry_status as enum ('draft', 'posted', 'reversed');

-- journal_entries: header row. Mirrors src/types/journalEntry.ts's JournalEntry
-- (minus `lines`, which is journal_lines below). No companyId field on the
-- domain type (single-tenant today) -- same flagged deviation as
-- SupabaseAccountRepository: company_id is NOT NULL here, resolved
-- internally by the repository.
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entry_number text not null,
  date timestamptz not null,
  memo text,
  status public.journal_entry_status not null default 'posted',
  posted_at timestamptz,
  currency text,
  source text not null,
  reversal_of_entry_id uuid references public.journal_entries(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, entry_number)
);

-- journal_lines: append-only detail rows. company_id is denormalized from
-- the parent entry (always set by create_journal_entry_with_lines() below,
-- never independently) rather than scoped via a join back to
-- journal_entries -- matches Phase A's "index/scope every company_id
-- directly" convention and keeps its RLS policies a plain equality check
-- like every other table instead of an EXISTS-subquery.
create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entries(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  account_id uuid not null references public.accounts(id),
  description text,
  debit numeric(14, 2) not null default 0,
  credit numeric(14, 2) not null default 0,
  line_no integer not null,
  -- Mirrors JournalEntryService.validateLines()'s per-line shape checks
  -- (src/features/accounting/services/journalEntryService.ts) at the
  -- storage layer -- the cross-line sum(debit)=sum(credit) invariant
  -- remains application-level only (docs/LEDGER_ARCHITECTURE.md's "Known
  -- gaps"), but a single line's shape is now enforced even against a
  -- second writer that bypasses the service entirely.
  constraint journal_lines_amounts_non_negative check (debit >= 0 and credit >= 0),
  constraint journal_lines_not_both_sides check (not (debit > 0 and credit > 0)),
  constraint journal_lines_not_empty check (not (debit = 0 and credit = 0))
);

-- audit_log_entries: mirrors src/types/auditLog.ts's AuditLogEntry.
--
-- FLAGGED DEVIATION: user_id/record_id/action are plain `text`, not
-- uuid/FK/enum. auditLogService (src/services/auditLogService.ts) is ONE
-- shared top-level singleton every feature writes to -- including
-- Sales/Purchases/Banking/Payroll/Tax, still Mock-backed (Phase D+, not
-- started), which still pass Mock-style ids (e.g. "inv_0001") and the
-- SYSTEM_USER_ID = 'system' sentinel (no real authenticated session yet --
-- docs/LEDGER_ARCHITECTURE.md's "Audit trail" section). A strict
-- uuid/FK/enum column would make every one of those still-Mock modules'
-- audit calls throw the moment this singleton is swapped to Supabase, long
-- before their own migration phase. `action` is additionally documented as
-- non-exhaustive/growing (src/types/auditLog.ts's AuditAction comment), so
-- a Postgres enum would need a migration every time a new action is added.
create table public.audit_log_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id text not null,
  action text not null,
  module text not null,
  record_type text not null,
  record_id text not null,
  previous_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes on every FK/filter column an RLS policy or query uses, matching
-- Phase A hardening (0002_phase_a_hardening).
create index journal_entries_company_id_idx on public.journal_entries (company_id);
create index journal_entries_date_idx on public.journal_entries (date);
create index journal_entries_reversal_of_entry_id_idx on public.journal_entries (reversal_of_entry_id);
create index journal_lines_journal_entry_id_idx on public.journal_lines (journal_entry_id);
create index journal_lines_company_id_idx on public.journal_lines (company_id);
create index journal_lines_account_id_idx on public.journal_lines (account_id);
create index audit_log_entries_company_id_idx on public.audit_log_entries (company_id);
create index audit_log_entries_record_idx on public.audit_log_entries (record_type, record_id);
create index audit_log_entries_created_at_idx on public.audit_log_entries (created_at);

alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
alter table public.audit_log_entries enable row level security;

-- SELECT + INSERT only, scoped to the caller's own company -- deliberately
-- NO update/delete policy on any of the three tables, so RLS denies those
-- commands outright regardless of table-level grants (belt) --------------
create policy journal_entries_select_own_company on public.journal_entries
  for select to authenticated
  using (company_id = (select public.get_my_company_id()));
create policy journal_entries_insert_own_company on public.journal_entries
  for insert to authenticated
  with check (company_id = (select public.get_my_company_id()));

create policy journal_lines_select_own_company on public.journal_lines
  for select to authenticated
  using (company_id = (select public.get_my_company_id()));
create policy journal_lines_insert_own_company on public.journal_lines
  for insert to authenticated
  with check (company_id = (select public.get_my_company_id()));

create policy audit_log_entries_select_own_company on public.audit_log_entries
  for select to authenticated
  using (company_id = (select public.get_my_company_id()));
create policy audit_log_entries_insert_own_company on public.audit_log_entries
  for insert to authenticated
  with check (company_id = (select public.get_my_company_id()));

-- ... and suspenders: this project's schema grants UPDATE/DELETE/TRUNCATE
-- on every new table to anon/authenticated by default (ALTER DEFAULT
-- PRIVILEGES, confirmed via pg_default_acl -- the same mechanism
-- 0003_lock_down_function_grants had to work around for functions). Revoke
-- them explicitly so append-only holds even if an RLS policy is ever
-- misconfigured later.
revoke update, delete, truncate on public.journal_entries from anon, authenticated;
revoke update, delete, truncate on public.journal_lines from anon, authenticated;
revoke update, delete, truncate on public.audit_log_entries from anon, authenticated;
revoke all on public.journal_entries from anon;
revoke all on public.journal_lines from anon;
revoke all on public.audit_log_entries from anon;

-- Atomic header+lines insert. SECURITY INVOKER (not DEFINER) -- both
-- inserts run as the calling authenticated user, so the RLS policies above
-- still apply exactly as they would to two direct client inserts. One
-- function call is one implicit Postgres transaction: if any line violates
-- a CHECK/FK/RLS constraint, the header insert rolls back too. This is the
-- guarantee two sequential client-side .insert() calls could not offer --
-- a header could otherwise commit with zero or partial lines if the second
-- call failed midway.
create function public.create_journal_entry_with_lines(
  p_company_id uuid,
  p_entry_number text,
  p_date timestamptz,
  p_memo text,
  p_status text,
  p_posted_at timestamptz,
  p_currency text,
  p_source text,
  p_reversal_of_entry_id uuid,
  p_lines jsonb
)
returns public.journal_entries
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entry public.journal_entries;
begin
  insert into public.journal_entries (
    company_id, entry_number, date, memo, status, posted_at, currency, source, reversal_of_entry_id
  ) values (
    p_company_id, p_entry_number, p_date, p_memo, p_status::public.journal_entry_status,
    p_posted_at, p_currency, p_source, p_reversal_of_entry_id
  )
  returning * into v_entry;

  insert into public.journal_lines (journal_entry_id, company_id, account_id, description, debit, credit, line_no)
  select
    v_entry.id,
    v_entry.company_id,
    (line ->> 'account_id')::uuid,
    line ->> 'description',
    (line ->> 'debit')::numeric,
    (line ->> 'credit')::numeric,
    (ord - 1)::int
  from jsonb_array_elements(p_lines) with ordinality as t(line, ord);

  return v_entry;
end;
$$;

-- Same ALTER DEFAULT PRIVILEGES quirk 0003 found for functions: revoke
-- explicitly rather than trust the generic PUBLIC revoke to have worked.
revoke all on function public.create_journal_entry_with_lines(
  uuid, text, timestamptz, text, text, timestamptz, text, text, uuid, jsonb
) from public, anon;
grant execute on function public.create_journal_entry_with_lines(
  uuid, text, timestamptz, text, text, timestamptz, text, text, uuid, jsonb
) to authenticated;
