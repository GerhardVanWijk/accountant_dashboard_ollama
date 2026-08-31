-- 0033_journal_number_allocator
-- Inventory Accounting Module — Phase 3C. AUTHORED, then APPLIED 2026-08-30 under the
-- controlled Review 3C-A procedure (per-migration verification; recorded versions
-- 20260830221042..20260830221256). Additive; 0 business rows changed except the
-- journal_number_counters seed + the 5060 account seed.
--
--
-- ONE safe journal-number architecture for the whole app.
--
-- Before 0033 three independent generators each did `count(*) + 1`:
--   * journalEntryService.nextEntryNumber()      (TS, over journalRepository.getAll())
--   * post_inventory_transaction    (migration 0031/0032, inline SQL)
--   * reverse_inventory_transaction (migration 0031, inline SQL)
-- `count(*) + 1` is wrong the moment a JE number is deleted or gapped (it would
-- re-issue a live number → the `journal_entries (company_id, entry_number)`
-- UNIQUE constraint then rejects the post) and races under concurrency (two
-- posts read the same count, both build `JE-000N`, the second fails closed).
--
-- 0033 introduces:
--   * `public.journal_number_counters` — one row per company, `next_value` =
--     the next ordinal to hand out. Seeded ONCE, per company, from the highest
--     EXISTING numeric `JE-<n>` suffix (see below). No historical entry is
--     renumbered.
--   * `public.allocate_journal_number(p_company_id uuid) returns text` — atomic
--     allocation via `UPDATE ... RETURNING` (row lock: concurrent callers
--     serialise deterministically), lazily creating the counter row for a
--     brand-new company. Returns `JE-<zero-padded ordinal>`.
--   * `create or replace public.create_journal_entry_with_lines(...)` (from
--     migration 0004) — when `p_entry_number` is NULL/'' it now calls the
--     allocator instead of trusting a client-computed number. Existing
--     signature, SECURITY INVOKER, and locked search_path are unchanged.
--
-- 0035 replaces the inline `count(*) + 1` in both inventory RPCs with
-- `allocate_journal_number(...)`, completing the single-generator goal.
--
-- Malformed / non-standard historic numbers: the seed only considers
-- `entry_number ~ '^JE-[0-9]+$'`. Anything else (a manual `OPENING`, a
-- `REV-2003`, an empty string) is deliberately ignored for the high-water
-- mark — it cannot collide with the `JE-<n>` sequence, and inventing a rule to
-- fold it in would risk seeding the counter too high or too low. If a company
-- has ONLY non-standard numbers the counter starts at 1 (`JE-0001`).
--
-- SECURITY: `allocate_journal_number` is SECURITY INVOKER (default) — the
-- caller's RLS applies to `journal_number_counters`, whose policy is the same
-- coarse company-tenant rule every other table uses. `p_company_id` passed by
-- `create_journal_entry_with_lines` is the repository-resolved company; under
-- RLS it must equal `get_my_company_id()` exactly as the `journal_entries`
-- insert on the next line already requires. EXECUTE is granted to
-- `authenticated` only; revoked from `public`/`anon`.

create table public.journal_number_counters (
  company_id uuid primary key references public.companies(id) on delete cascade,
  next_value bigint not null default 1,
  updated_at timestamptz not null default now(),
  constraint journal_number_counters_next_value_positive check (next_value >= 1)
);

alter table public.journal_number_counters enable row level security;

create policy journal_number_counters_all_own_company on public.journal_number_counters
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

-- One-time high-water-mark seed. `next_value` = (highest existing JE-<n> suffix)
-- + 1, per company; 1 when a company has no standard-numbered entry yet.
-- `substring(... from '^JE-0*([0-9]+)$')` strips the `JE-` prefix and any
-- leading zeros before the ::bigint cast. Idempotent via ON CONFLICT so a
-- re-run (or a fresh install where the seed file already populated history)
-- never lowers a counter.
insert into public.journal_number_counters (company_id, next_value)
select
  c.id,
  coalesce(
    max((substring(je.entry_number from '^JE-0*([0-9]+)$'))::bigint)
      filter (where je.entry_number ~ '^JE-[0-9]+$'),
    0
  ) + 1
from public.companies c
left join public.journal_entries je on je.company_id = c.id
group by c.id
on conflict (company_id) do nothing;

-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.allocate_journal_number(p_company_id uuid)
returns text
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_ordinal bigint;
begin
  if p_company_id is null then
    raise exception 'allocate_journal_number: company id is required';
  end if;

  -- Lazily create the counter for a company that had none at 0033 apply time
  -- (a company created after this migration). Seeded from its own history so a
  -- late-created company that somehow already has JE-<n> rows is still safe.
  insert into public.journal_number_counters (company_id, next_value)
  select
    p_company_id,
    coalesce(
      max((substring(je.entry_number from '^JE-0*([0-9]+)$'))::bigint)
        filter (where je.entry_number ~ '^JE-[0-9]+$'),
      0
    ) + 1
  from public.journal_entries je
  where je.company_id = p_company_id
  on conflict (company_id) do nothing;

  -- Atomic: the UPDATE takes a row lock, so two concurrent allocations for the
  -- same company serialise — the second blocks until the first commits, then
  -- reads the incremented value. Different companies never contend (different
  -- rows). `returning next_value - 1` yields the ordinal just consumed.
  update public.journal_number_counters
     set next_value = next_value + 1,
         updated_at = now()
   where company_id = p_company_id
   returning next_value - 1 into v_ordinal;

  if v_ordinal is null then
    raise exception 'allocate_journal_number: no counter row for company % (and it could not be created)', p_company_id;
  end if;

  return 'JE-' || lpad(v_ordinal::text, 4, '0');
end;
$$;

revoke all on function public.allocate_journal_number(uuid) from public, anon;
grant execute on function public.allocate_journal_number(uuid) to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- create_journal_entry_with_lines: identical to migration 0004 except the new
-- guard block — a NULL/'' entry number is allocated server-side instead of
-- trusted from the client. SECURITY INVOKER + locked search_path preserved.
create or replace function public.create_journal_entry_with_lines(
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
  v_entry_number text := p_entry_number;
begin
  if v_entry_number is null or v_entry_number = '' then
    v_entry_number := public.allocate_journal_number(p_company_id);
  end if;

  insert into public.journal_entries (
    company_id, entry_number, date, memo, status, posted_at, currency, source, reversal_of_entry_id
  ) values (
    p_company_id, v_entry_number, p_date, p_memo, p_status::public.journal_entry_status,
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

revoke all on function public.create_journal_entry_with_lines(
  uuid, text, timestamptz, text, text, timestamptz, text, text, uuid, jsonb
) from public, anon;
grant execute on function public.create_journal_entry_with_lines(
  uuid, text, timestamptz, text, text, timestamptz, text, text, uuid, jsonb
) to authenticated;
