-- 0100_tax_config_immutability
-- Tax & Compliance integrity audit (2026-09-12). AUTHORED, NOT APPLIED.
-- Apply AFTER 0005 (tax_rates), 0007 (income_tax_year_configs /
-- dividends_withholding_tax_configs / cgt_inclusion_rate_configs /
-- cgt_annual_exclusion_configs), 0038/0039/0040/0041/0029/0080 (the
-- composite-FK line tables tax_rates' "used" check reads).
--
-- CONTEXT. Every statutory tax-configuration table in this codebase is
-- documented as effective-dated and "never edited in place" —
-- `TaxRateService`'s own doc comment says exactly that, and
-- `IncomeTaxConfigService`/`DividendsWithholdingTaxConfigService`/
-- `CgtConfigService` are all deliberately create-only in application code
-- (no `updateConfig()`/`deleteConfig()` method exists anywhere). But
-- before this migration, that discipline was ENFORCED ONLY IN THE
-- APPLICATION LAYER — RLS on every one of these five tables is a plain
-- `for all to authenticated using (company_id = get_my_company_id())`,
-- which places NO restriction on which columns change or whether a row
-- has already been relied on. A direct Supabase call (or a future code
-- change that adds an "edit" button without re-deriving this discipline)
-- could silently rewrite a HISTORICAL VAT rate, corporate tax rate, SBC
-- bracket table, dividends withholding rate, or CGT inclusion
-- rate/annual exclusion — which would silently change the tax treatment
-- of every ALREADY-POSTED historical transaction that resolved its rate
-- from that row at report/compute time (VAT reports re-resolve
-- `taxRateId` against `allTaxRates` on every render;
-- Income Tax/Deferred Tax/CGT/Dividends all resolve their config by
-- effective date, not a frozen snapshot). This is exactly the
-- "no historical transaction may silently adopt a future rate" invariant
-- §4 of the Tax & Compliance audit requires, and exactly the class of bug
-- migration 0092 already closed for `payroll_tax_year_configs` — this
-- migration closes the same class for the other five tax-config tables
-- the 0092 hardening pass did not reach.
--
-- This is a DATABASE guarantee, not a new application feature: no UI
-- changes, no app-code changes required. Existing app code already never
-- performs any of the writes this migration blocks.
--
-- ============================================================================
-- 1. tax_rates — richer lifecycle (create -> supersede() closes the prior
--    open version's effective_to -> deactivate() flips is_active), so this
--    needs a real column-diff guard rather than a blanket block.
-- ============================================================================
--
-- Allowed on UPDATE, always: is_active, name, updated_at.
-- Allowed on UPDATE, exactly once: effective_to, but ONLY the
--   NULL -> not-null transition (closing an open-ended rate — what
--   TaxRateService.supersede() does to the version it is replacing). Once
--   effective_to is set, it can never change again — a closed rate's
--   close date is final.
-- Everything else (code, rate, treatment, applies_to, effective_from,
--   jurisdiction, source_reference, company_id) is immutable from the
--   moment the row is created, independent of whether any transaction has
--   used it yet — mirrors the class doc comment's own stated intent
--   ("A TaxRate record is immutable once created — rate is never edited
--   in place").
-- DELETE is blocked once ANY posted-document line or VAT source entry
--   references this rate (checked across every table with a composite
--   FK to tax_rates(company_id, id): invoice_lines, bill_lines,
--   credit_note_lines, purchase_order_lines, supplier_return_lines,
--   vat_source_entries). An unused, just-created rate can still be
--   deleted to correct an immediate data-entry mistake.

create or replace function public.forbid_tax_rate_mutation()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_used_by text;
begin
  if tg_op = 'DELETE' then
    select 'invoice line' into v_used_by from public.invoice_lines where tax_rate_id = old.id limit 1;
    if v_used_by is null then
      select 'bill line' into v_used_by from public.bill_lines where tax_rate_id = old.id limit 1;
    end if;
    if v_used_by is null then
      select 'credit note line' into v_used_by from public.credit_note_lines where tax_rate_id = old.id limit 1;
    end if;
    if v_used_by is null then
      select 'purchase order line' into v_used_by from public.purchase_order_lines where tax_rate_id = old.id limit 1;
    end if;
    if v_used_by is null then
      select 'supplier return line' into v_used_by from public.supplier_return_lines where tax_rate_id = old.id limit 1;
    end if;
    if v_used_by is null then
      select 'VAT source entry' into v_used_by from public.vat_source_entries where tax_rate_id = old.id limit 1;
    end if;
    if v_used_by is not null then
      raise exception 'tax_rates "%" (%) cannot be deleted: already referenced by at least one % — a used tax rate is accounting evidence and must remain frozen and reproducible. Supersede it instead (create the next version) and deactivate this one.', old.code, old.name, v_used_by;
    end if;
    return old;
  end if;

  -- UPDATE: everything except is_active/name/updated_at/effective_to is frozen at creation.
  if old.code            is distinct from new.code
     or old.company_id   is distinct from new.company_id
     or old.rate          is distinct from new.rate
     or old.treatment     is distinct from new.treatment
     or old.applies_to    is distinct from new.applies_to
     or old.effective_from is distinct from new.effective_from
     or old.jurisdiction  is distinct from new.jurisdiction
     or old.source_reference is distinct from new.source_reference
  then
    raise exception 'tax_rates "%" (%): only effective_to (closing an open-ended version, once), is_active, and name may ever change on an existing tax rate version. To change the rate/treatment/dates/source, create a NEW version via supersede() instead — see TaxRateService.', old.code, old.name;
  end if;

  if old.effective_to is distinct from new.effective_to then
    if old.effective_to is not null then
      raise exception 'tax_rates "%" (%): effective_to is already set to % and cannot be changed again — a closed rate version''s close date is final.', old.code, old.name, old.effective_to;
    end if;
    if new.effective_to is null or new.effective_to <= old.effective_from then
      raise exception 'tax_rates "%" (%): effective_to must be a real date after effective_from (%).', old.code, old.name, old.effective_from;
    end if;
  end if;

  return new;
end;
$$;

create trigger tax_rates_forbid_mutation_update
  before update on public.tax_rates
  for each row execute function public.forbid_tax_rate_mutation();

create trigger tax_rates_forbid_mutation_delete
  before delete on public.tax_rates
  for each row execute function public.forbid_tax_rate_mutation();

-- ============================================================================
-- 2. income_tax_year_configs — create-only in application code; DELETE of
--    a referenced row is already blocked by the plain FK from
--    tax_computations.tax_config_id / deferred_tax_computations.tax_config_id
--    (no ON DELETE CASCADE/SET NULL was ever specified — the default is
--    RESTRICT). Only UPDATE needs a guard: nothing here is "just
--    metadata" — every column is a statutory figure (corporate rate, SBC
--    brackets) or its citation (source_reference), same reasoning 0092
--    used for payroll_tax_year_configs.
-- ============================================================================

create or replace function public.forbid_income_tax_year_config_update()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  raise exception 'income_tax_year_configs "%" cannot be modified once created — every column is a statutory figure or its source citation. Add the next SARS year of assessment''s config instead (IncomeTaxConfigService.createConfig()).', old.tax_year_label;
end;
$$;

create trigger income_tax_year_configs_forbid_update
  before update on public.income_tax_year_configs
  for each row execute function public.forbid_income_tax_year_config_update();

-- ============================================================================
-- 3/4/5. dividends_withholding_tax_configs, cgt_inclusion_rate_configs,
--    cgt_annual_exclusion_configs — the same create-only pattern, but with
--    no downstream FK to lean on for delete-protection (dividend
--    declarations/CGT disposal adjustments store the COMPUTED figures,
--    e.g. rate_percent_applied, not a config id — see each service's own
--    doc comment). UPDATE is always blocked (nothing here is metadata
--    either). DELETE is blocked once the row is no longer the newest
--    version for its scope (company_id, and additionally
--    entity_type_bucket for the CGT inclusion-rate table) — a row with a
--    later sibling has necessarily been in effect for some period of
--    real time and must stay reproducible; only the single newest,
--    as-yet-unsuperseded row for a scope may still be deleted, to correct
--    an immediate data-entry mistake before anything relies on it.
--
-- KNOWN LIMITATION (documented, not fixed here): this "not the newest
-- row" delete guard is a scope-level proxy for "already relied upon", not
-- an exact per-transaction reference the way tax_rates' guard is. A
-- config could in principle be deleted moments after being wrongly relied
-- upon by a declaration/disposal computed in the same instant a newer
-- config is also added. The precise fix is a snapshot FK column on
-- `dividend_declarations` / `cgt_disposal_adjustments` (mirroring
-- `vat_source_entries.tax_rate_id`, migration 0080) recording exactly
-- which config row computed each figure — a genuine schema change, out of
-- scope for this hardening pass. Flagged in the audit report as a
-- recommended follow-up, not silently worked around here.
-- ============================================================================

create or replace function public.forbid_dividends_withholding_config_update()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  raise exception 'dividends_withholding_tax_configs (effective %) cannot be modified once created. Add the next rate change as a new config instead (DividendsWithholdingTaxConfigService.createConfig()).', old.effective_from;
end;
$$;

create trigger dividends_withholding_tax_configs_forbid_update
  before update on public.dividends_withholding_tax_configs
  for each row execute function public.forbid_dividends_withholding_config_update();

create or replace function public.forbid_dividends_withholding_config_delete()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  if exists (
    select 1 from public.dividends_withholding_tax_configs newer
    where newer.company_id = old.company_id and newer.effective_from > old.effective_from
  ) then
    raise exception 'dividends_withholding_tax_configs (effective %) cannot be deleted: a later-dated version already exists, so this version has been in effect for a real period and must remain reproducible.', old.effective_from;
  end if;
  return old;
end;
$$;

create trigger dividends_withholding_tax_configs_forbid_delete
  before delete on public.dividends_withholding_tax_configs
  for each row execute function public.forbid_dividends_withholding_config_delete();

create or replace function public.forbid_cgt_inclusion_rate_config_update()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  raise exception 'cgt_inclusion_rate_configs (% effective %) cannot be modified once created. Add the next rate change as a new config instead (CgtConfigService.createInclusionRateConfig()).', old.entity_type_bucket, old.effective_from;
end;
$$;

create trigger cgt_inclusion_rate_configs_forbid_update
  before update on public.cgt_inclusion_rate_configs
  for each row execute function public.forbid_cgt_inclusion_rate_config_update();

create or replace function public.forbid_cgt_inclusion_rate_config_delete()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  if exists (
    select 1 from public.cgt_inclusion_rate_configs newer
    where newer.company_id = old.company_id
      and newer.entity_type_bucket = old.entity_type_bucket
      and newer.effective_from > old.effective_from
  ) then
    raise exception 'cgt_inclusion_rate_configs (% effective %) cannot be deleted: a later-dated version already exists for this entity-type bucket, so this version has been in effect for a real period and must remain reproducible.', old.entity_type_bucket, old.effective_from;
  end if;
  return old;
end;
$$;

create trigger cgt_inclusion_rate_configs_forbid_delete
  before delete on public.cgt_inclusion_rate_configs
  for each row execute function public.forbid_cgt_inclusion_rate_config_delete();

create or replace function public.forbid_cgt_annual_exclusion_config_update()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  raise exception 'cgt_annual_exclusion_configs (effective %) cannot be modified once created. Add the next rate change as a new config instead (CgtConfigService.createAnnualExclusionConfig()).', old.effective_from;
end;
$$;

create trigger cgt_annual_exclusion_configs_forbid_update
  before update on public.cgt_annual_exclusion_configs
  for each row execute function public.forbid_cgt_annual_exclusion_config_update();

create or replace function public.forbid_cgt_annual_exclusion_config_delete()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  if exists (
    select 1 from public.cgt_annual_exclusion_configs newer
    where newer.company_id = old.company_id and newer.effective_from > old.effective_from
  ) then
    raise exception 'cgt_annual_exclusion_configs (effective %) cannot be deleted: a later-dated version already exists, so this version has been in effect for a real period and must remain reproducible.', old.effective_from;
  end if;
  return old;
end;
$$;

create trigger cgt_annual_exclusion_configs_forbid_delete
  before delete on public.cgt_annual_exclusion_configs
  for each row execute function public.forbid_cgt_annual_exclusion_config_delete();
