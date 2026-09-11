-- 0091c_helper_function_grants_hardening
-- Belt-and-braces consistency fix: every other function introduced in
-- 0085-0098 has an explicit revoke-from-public/anon + grant-to-authenticated
-- pair; `payroll_period_date` (0091b) and the
-- `forbid_used_payroll_tax_config_mutation` trigger function (0092) were
-- left on Postgres's default PUBLIC execute grant. Neither is a real
-- exploitable path (payroll_period_date is a pure stateless date
-- computation with no company-scoping meaning; the trigger function
-- returns `trigger` and cannot be meaningfully invoked outside the trigger
-- mechanism itself), but tightening them matches this migration set's own
-- established convention rather than leaving an inconsistency for a future
-- reader to wonder about.
revoke all on function public.payroll_period_date(timestamptz) from public, anon;
grant execute on function public.payroll_period_date(timestamptz) to authenticated;

revoke all on function public.forbid_used_payroll_tax_config_mutation() from public, anon, authenticated;
