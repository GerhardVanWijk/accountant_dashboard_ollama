-- 0074_accounting_settings_audit
-- ADMINISTRATION MODULE · BLOCK E — Settings / Accounting Settings (2026-09-07,
-- branch administration-module-2026-09-06). PRE-MERGE. `main` untouched.
--
-- ═══════════════════════════════════════════════════════════════════════
-- WHY
--   The Company page (`/companies` → CompanyForm) already lets an admin
--   edit the company's accounting configuration — accounting basis,
--   financial year end, functional/presentation currency, VAT registration
--   / filing frequency / accounting basis. Those are HIGH-RISK accounting
--   settings, but the plain `update companies` path wrote NO audit row
--   (only reporting-framework / SBC-eligibility changes were audited, via
--   the service layer). The Block E brief requires every high-risk
--   accounting-setting change to leave Audit Trail evidence with before/
--   after values.
--
-- WHAT
--   A single BEFORE-UPDATE trigger on `public.companies` that, whenever one
--   of the audited accounting-config columns actually changes, writes an
--   append-only `audit_log_entries` row (module 'settings', action
--   'accounting_setting_changed') carrying the exact before/after JSON.
--   Trigger-based, so it covers the existing CompanyForm path AND any
--   future path — it cannot be bypassed by calling the table directly.
--
--   Also adds the same coverage to `category_account_mappings` (product
--   category → revenue / COGS / inventory account) so that when a mapping
--   editor lands, its changes are already audited.
--
-- NOT IN SCOPE
--   No schema change to accounting tables, no RLS change, no data
--   backfill, no retroactive mutation of anything posted. This migration
--   only adds observability.


-- ─────────────────────────────────────────────────────────────────────
-- 1. companies — accounting-config change audit
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.companies_accounting_settings_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid  text := coalesce((select auth.uid())::text, 'system');
  v_old  jsonb;
  v_new  jsonb;
begin
  v_old := jsonb_strip_nulls(jsonb_build_object(
    'accountingBasis',        old.accounting_basis,
    'functionalCurrency',     old.functional_currency,
    'presentationCurrency',   old.presentation_currency,
    'financialYearEndMonth',  old.financial_year_end_month,
    'financialYearEndDay',    old.financial_year_end_day,
    'isVatRegistered',        old.is_vat_registered,
    'vatRegistrationNumber',  old.vat_registration_number,
    'vatFilingFrequency',     old.vat_filing_frequency,
    'vatAccountingBasis',     old.vat_accounting_basis,
    'financialStatementsCompilation', old.financial_statements_compilation
  ));
  v_new := jsonb_strip_nulls(jsonb_build_object(
    'accountingBasis',        new.accounting_basis,
    'functionalCurrency',     new.functional_currency,
    'presentationCurrency',   new.presentation_currency,
    'financialYearEndMonth',  new.financial_year_end_month,
    'financialYearEndDay',    new.financial_year_end_day,
    'isVatRegistered',        new.is_vat_registered,
    'vatRegistrationNumber',  new.vat_registration_number,
    'vatFilingFrequency',     new.vat_filing_frequency,
    'vatAccountingBasis',     new.vat_accounting_basis,
    'financialStatementsCompilation', new.financial_statements_compilation
  ));

  if v_old is distinct from v_new then
    insert into public.audit_log_entries
      (company_id, user_id, action, module, record_type, record_id, previous_value, new_value)
    values (new.id, v_uid, 'accounting_setting_changed', 'settings', 'Company', new.id::text,
            v_old, v_new);
  end if;
  return new;
end;
$$;

revoke all on function public.companies_accounting_settings_audit() from public, anon, authenticated;

drop trigger if exists companies_accounting_settings_audit_bu on public.companies;
create trigger companies_accounting_settings_audit_bu
  before update on public.companies
  for each row execute function public.companies_accounting_settings_audit();


-- ─────────────────────────────────────────────────────────────────────
-- 2. category_account_mappings — change audit (module 'settings')
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.category_account_mapping_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := coalesce((select auth.uid())::text, 'system');
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log_entries
      (company_id, user_id, action, module, record_type, record_id, new_value)
    values (new.company_id, v_uid, 'account_mapping_changed', 'settings', 'CategoryAccountMapping', new.id::text,
            jsonb_build_object('categoryName', new.category_name,
                               'revenueAccountId', new.revenue_account_id,
                               'cogsAccountId', new.cogs_account_id,
                               'inventoryAccountId', new.inventory_account_id));
    return new;
  elsif tg_op = 'UPDATE' then
    if (old.category_name, old.revenue_account_id, old.cogs_account_id, old.inventory_account_id)
       is distinct from
       (new.category_name, new.revenue_account_id, new.cogs_account_id, new.inventory_account_id) then
      insert into public.audit_log_entries
        (company_id, user_id, action, module, record_type, record_id, previous_value, new_value)
      values (new.company_id, v_uid, 'account_mapping_changed', 'settings', 'CategoryAccountMapping', new.id::text,
              jsonb_build_object('categoryName', old.category_name,
                                 'revenueAccountId', old.revenue_account_id,
                                 'cogsAccountId', old.cogs_account_id,
                                 'inventoryAccountId', old.inventory_account_id),
              jsonb_build_object('categoryName', new.category_name,
                                 'revenueAccountId', new.revenue_account_id,
                                 'cogsAccountId', new.cogs_account_id,
                                 'inventoryAccountId', new.inventory_account_id));
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.audit_log_entries
      (company_id, user_id, action, module, record_type, record_id, previous_value)
    values (old.company_id, v_uid, 'account_mapping_changed', 'settings', 'CategoryAccountMapping', old.id::text,
            jsonb_build_object('categoryName', old.category_name, 'deleted', true));
    return old;
  end if;
  return null;
end;
$$;

revoke all on function public.category_account_mapping_audit() from public, anon, authenticated;

drop trigger if exists category_account_mapping_audit_aiud on public.category_account_mappings;
create trigger category_account_mapping_audit_aiud
  after insert or update or delete on public.category_account_mappings
  for each row execute function public.category_account_mapping_audit();


-- ─────────────────────────────────────────────────────────────────────
-- 3. Observability
-- ─────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'companies_accounting_settings_audit_bu') then
    raise exception '0074: companies accounting-settings audit trigger missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'category_account_mapping_audit_aiud') then
    raise exception '0074: category_account_mappings audit trigger missing';
  end if;
  raise notice '0074: OK — accounting-settings + account-mapping change audit triggers in place.';
end $$;
