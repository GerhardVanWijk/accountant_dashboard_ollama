-- 0091b_payroll_period_date_search_path_fix
-- Follow-up to 0091: `payroll_period_date` (the IMMUTABLE UTC-date wrapper
-- used by the payroll_runs_no_overlapping_period EXCLUDE constraint) was
-- created without an explicit `search_path`, flagged by
-- get_advisors(security) as function_search_path_mutable immediately after
-- 0091 applied live. Pinning it here, matching every other function in
-- this schema (SET search_path TO 'public' is the established convention
-- throughout 0079-0098).
alter function public.payroll_period_date(timestamptz) set search_path = 'public';
