-- 0075b_notification_muteable_search_path
-- ADMINISTRATION MODULE · BLOCK G follow-up (2026-09-07). PRE-MERGE.
--
-- The Supabase security advisor flagged `notification_muteable_category`
-- (from 0073) with `function_search_path_mutable`. It touches no schema
-- objects — it is a literal `in (...)` test — so an empty search_path is
-- the correct fix. Migration 0073 already carries the fixed definition;
-- this file exists only because 0073 was applied to the live project
-- before the advisor run.
create or replace function public.notification_muteable_category(p_category text) returns boolean
language sql immutable set search_path = '' as $$
  select p_category in ('inventory_integrity','budget_variance','receivable_overdue','document_expiry');
$$;
