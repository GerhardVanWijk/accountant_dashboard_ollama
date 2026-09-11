-- 0095_subledger_settlement_ledger
-- Leases + Payroll integrity hardening — FINAL PRE-MIGRATION HARDENING,
-- PART A (database-level clearing over-settlement protection). AUTHORED,
-- NOT APPLIED. Apply AFTER 0091 (payroll_runs.contra_account_id/
-- journal_entry_id) and 0089 (lease_amortization_entries exists — it has
-- since 0008, this migration just references it).
--
-- THE GAP THIS CLOSES: `bankTransactionService.recordSubledgerSettlement()`
-- (added in the prior pass of this audit) let a caller record a Net Pay
-- Payable / Lease Payment Clearing settlement for ANY amount — the
-- outstanding-balance cap lived ONLY in `SettleClearingBalanceForm.tsx`
-- (a React `<input max=...>`), which a second browser tab, a stale page, a
-- retried request, or a direct service/RPC call bypasses completely. Two
-- users settling the same R10,000 payroll run for R7,000 each, from two
-- tabs, could legitimately create R14,000 of bank-side settlement against
-- a R10,000 obligation, with NOTHING at the database layer to stop it.
--
-- THIS TABLE is the authoritative settlement ledger AND the idempotency
-- log for `settle_payroll_net_pay` (0096) / `settle_lease_period_payment`
-- (0097) in one — not a second parallel bookkeeping system: `amount` here
-- is the ONLY place "how much has actually been settled" is ever summed
-- from (never re-derived from `bank_transactions.amount`, which is a
-- generic table that was never designed to answer "how much of THIS
-- specific obligation is settled" precisely). Both settlement RPCs LOCK
-- the authoritative source row (`payroll_runs` / `lease_amortization_entries`)
-- FOR UPDATE before reading this table's sum — see 0096/0097's headers for
-- why that ordering is what actually makes the over-settlement check
-- concurrency-safe, not just "checked in the same statement."
--
-- `source_type`/`source_id` distinguishes:
--   'payroll_run'            -> payroll_runs.id            (one obligation per whole run)
--   'lease_amortization_entry' -> lease_amortization_entries.id (one obligation per PERIOD —
--                                FINAL HARDENING PART B: a lease's clearing balance is now
--                                tracked per amortization period, not as one opaque cumulative
--                                figure per lease. `matched_entity_type` on `bank_transactions`
--                                changes from the prior pass's 'lease_contract' to this — no
--                                lease has ever been settled in production (0 rows), so this is
--                                a clean rename, not a backfill).
-- No FK to either target table (same "documented convention, not an
-- enforced constraint" reasoning `journal_entries.source` and
-- `bank_transactions.matched_entity_type` already accept in this schema,
-- for the identical reason: which table `source_id` points into depends
-- on `source_type`, which plain Postgres FKs cannot express).

create table public.subledger_settlements (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,
  settlement_id         uuid not null,
  source_type           text not null,
  source_id             uuid not null,
  amount                numeric(14, 2) not null,
  bank_account_id       uuid not null references public.bank_accounts(id),
  bank_transaction_id   uuid references public.bank_transactions(id),
  journal_entry_id      uuid references public.journal_entries(id),
  created_by            text,
  created_at            timestamptz not null default now(),
  constraint subledger_settlements_amount_positive check (amount > 0),
  unique (company_id, settlement_id)
);

-- The "how much of THIS obligation has already been settled" query both
-- RPCs run immediately after locking the source row.
create index subledger_settlements_source_idx on public.subledger_settlements (company_id, source_type, source_id);

alter table public.subledger_settlements enable row level security;

create policy subledger_settlements_select_own_company on public.subledger_settlements
  for select to authenticated
  using (company_id = (select public.get_my_company_id()));

-- INSERT only ever happens from inside the SECURITY INVOKER settlement
-- RPCs below, as the authenticated caller — no direct client INSERT is a
-- legitimate path (a client-side INSERT would bypass every check the RPCs
-- perform), so this policy exists only so the RPCs' own INSERT (running
-- as the invoking user) is permitted, not so a client can INSERT directly
-- without going through them. UPDATE/DELETE are granted to no one —
-- append-only, same as depreciation_entries/asset_disposals/
-- lease_amortization_entries.
create policy subledger_settlements_insert_own_company on public.subledger_settlements
  for insert to authenticated
  with check (company_id = (select public.get_my_company_id()));

revoke update, delete, truncate on public.subledger_settlements from anon, authenticated;
revoke all on public.subledger_settlements from anon;
