-- 0098_bill_lease_period_tag
-- Leases + Payroll integrity hardening — FINAL PRE-MIGRATION HARDENING,
-- PART B (lease clearing becomes period-traceable) follow-up. AUTHORED,
-- NOT APPLIED. Apply AFTER 0087 (bills.lease_id).
--
-- `bills.lease_id` (0087) says WHICH lease a Bill invoices. This column
-- optionally says WHICH amortization period it corresponds to — nullable,
-- and deliberately NOT a foreign key to `lease_amortization_entries`:
-- a Bill is very often captured/posted BEFORE that period's amortization
-- run has happened yet (the lessor's invoice usually arrives before or
-- around the period end, not after), so the target row may not exist yet
-- at Bill-creation time. A plain `date` matched against
-- `lease_amortization_entries.period_end` when both exist is the honest
-- model — no fake forced one-to-one row link, and no requirement that
-- every lease Bill map to exactly one period at all: a lessor invoice
-- covering an upfront/multi-month charge (a deposit, a catch-up
-- adjustment, an annual-in-advance rental) legitimately does NOT
-- correspond to a single period, and this column is simply left null for
-- those — the Bill still carries its `lease_id`, so it is not
-- untraceable, just not period-attributed.
--
-- Application code (out of this schema-only migration's scope, matching
-- 0087/0053's precedent) resolves "which Bills relate to period X" by
-- matching `bills.lease_period_end = entry.period_end` for the SAME
-- `lease_id`, alongside always showing every `lease_id`-tagged Bill
-- regardless of period match.

alter table public.bills
  add column if not exists lease_period_end date;

comment on column public.bills.lease_period_end is
  'Optional: which lease_amortization_entries.period_end this Bill''s invoice corresponds to, for a company that tags one Bill per period. Null when the Bill is not period-specific (spans multiple periods, is an upfront/catch-up charge, or the period has not been amortized yet). See migration 0098.';
