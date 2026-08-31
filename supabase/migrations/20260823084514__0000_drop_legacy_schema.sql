-- Backfilled from supabase_migrations.schema_migrations (already applied to the live project).
-- version: 20260823084514 · name: 0000_drop_legacy_schema

-- Drops the pre-existing, hand-built schema (27 tables, 0 rows, untracked by
-- Supabase migrations) that didn't match the real application's domain types.
-- Confirmed empty via list_tables before this ran. CASCADE handles FK
-- dependency order automatically.

drop table if exists public.audit_logs cascade;
drop table if exists public.employees cascade;
drop table if exists public.fixed_assets cascade;
drop table if exists public.expenses cascade;
drop table if exists public.stock_movements cascade;
drop table if exists public.tax_transactions cascade;
drop table if exists public.tax_rates cascade;
drop table if exists public.journal_lines cascade;
drop table if exists public.journal_entries cascade;
drop table if exists public.accounts cascade;
drop table if exists public.reconciliations cascade;
drop table if exists public.bank_transactions cascade;
drop table if exists public.bank_accounts cascade;
drop table if exists public.bill_lines cascade;
drop table if exists public.bills cascade;
drop table if exists public.payments cascade;
drop table if exists public.invoice_lines cascade;
drop table if exists public.invoices cascade;
drop table if exists public.warehouses cascade;
drop table if exists public.products cascade;
drop table if exists public.suppliers cascade;
drop table if exists public.customers cascade;
drop table if exists public.user_roles cascade;
drop table if exists public.permissions cascade;
drop table if exists public.roles cascade;
drop table if exists public.users cascade;
drop table if exists public.companies cascade;
