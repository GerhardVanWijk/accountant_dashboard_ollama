-- 0097c_lease_amortization_entries_lock_policy
-- Follow-up to 0097b: granting table-level UPDATE alone was NOT sufficient
-- — confirmed live, `settle_lease_period_payment`'s `select ... for update`
-- against `lease_amortization_entries` now returns "not found" instead of
-- "permission denied": with row level security enabled and NO UPDATE/ALL
-- policy defined for a table, Postgres treats a locking read (FOR UPDATE/
-- FOR SHARE) as requiring an applicable UPDATE-command policy to determine
-- which rows may be locked — with none defined, every row is filtered out
-- of the lock, even though the existing SELECT policy would have made the
-- same row visible to a plain (non-locking) SELECT.
--
-- This policy supplies exactly that, scoped identically to the table's
-- existing company-scoped SELECT/INSERT policies (`USING`), while
-- `WITH CHECK (false)` means an ACTUAL write attempt through this policy
-- always fails — the append-only guarantee stays intact; only the ability
-- to take a row lock for concurrency-serialisation purposes is added.
-- Confirmed by direct test in a rolled-back transaction: a genuine UPDATE
-- against this table by `authenticated` still matches zero rows after
-- this policy was applied.
create policy lease_amortization_entries_lock_only on public.lease_amortization_entries
  for update to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (false);
