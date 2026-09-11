-- 0092_payroll_tax_config_immutability
-- Leases + Payroll accounting-integrity hardening (PART 2 — payroll
-- statutory governance, audit item 4). AUTHORED, NOT APPLIED. Apply AFTER
-- 0091 (this trigger reads `payroll_runs.payroll_tax_year_config_id`).
--
-- `payrollTaxConfigService` (src/features/employees/services/payrollTaxConfigService.ts)
-- has always been create-only in application code — there is no
-- `updateConfig()`/`deleteConfig()` method today. This migration makes
-- that a DATABASE guarantee, not just an absence of a UI button: once a
-- `payroll_tax_year_configs` row has been used to compute ANY payroll run
-- (posted OR still draft — a draft run's payslips were already computed
-- from it, and silently changing the brackets under a pending draft would
-- desync the draft's numbers from what `updatePayslipOverride()` would
-- recompute next), it can never be UPDATEd or DELETEd again — full stop,
-- not a partial "some columns are still editable" carve-out, because every
-- column on this table is a statutory figure (PAYE brackets, rebates, UIF
-- rate/ceiling, SDL rate/threshold) or its citation (source_reference) —
-- there is no "just metadata" column here the way `Payment.reference`/
-- `notes` are non-financial on a Payment.
--
-- The correct correction path if a config was captured wrong is the one
-- this codebase already uses for a superseded statutory table: create the
-- NEXT tax year's row with `createConfig()`. A genuinely wrong not-yet-used
-- config (never referenced by any payroll_runs row) can still be
-- corrected/deleted freely — this trigger only locks a config the moment
-- real payroll numbers depend on it, matching FixedAssets/Leases/every
-- other posted-record guard in this codebase (edit freely pre-post,
-- immutable once real accounting history depends on it).

create or replace function public.forbid_used_payroll_tax_config_mutation()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_used_by text;
begin
  select r.run_number into v_used_by
    from public.payroll_runs r
   where r.payroll_tax_year_config_id = old.id
   limit 1;

  if v_used_by is not null then
    if tg_op = 'DELETE' then
      raise exception 'payroll_tax_year_configs "%" cannot be deleted: already used by payroll run "%" (and possibly others). Historical payroll figures must remain frozen and reproducible — add the next tax year''s config instead.', old.tax_year_label, v_used_by;
    else
      raise exception 'payroll_tax_year_configs "%" cannot be modified: already used by payroll run "%" (and possibly others). Historical payroll figures must remain frozen and reproducible — add the next tax year''s config instead of editing this one.', old.tax_year_label, v_used_by;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger payroll_tax_year_configs_forbid_used_update
  before update on public.payroll_tax_year_configs
  for each row execute function public.forbid_used_payroll_tax_config_mutation();

create trigger payroll_tax_year_configs_forbid_used_delete
  before delete on public.payroll_tax_year_configs
  for each row execute function public.forbid_used_payroll_tax_config_mutation();
