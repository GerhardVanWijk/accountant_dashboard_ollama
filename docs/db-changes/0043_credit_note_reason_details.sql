-- 0043_credit_note_reason_details
-- Adds credit_notes.reason_details — the free-text explanation the UI collects
-- (and requires) when reason = 'other' (docs brief Part I / FORM+TRANSACTION UX PASS).
--
-- Before this column the "Specify reason" text had nowhere of its own to live and was
-- being folded into `notes` as a `[Other: …]` line. This gives it a first-class home so
-- the credit note document model carries the reason properly, not overloaded onto notes.
--
-- Purely additive: one nullable text column, no default, no backfill, no change to any
-- existing column. Every existing credit_notes row keeps working unchanged; the 6 rows
-- currently in the live project are unaffected (all have a non-'other' reason).
--
-- RLS: none needed — column-level, inherits the table's existing
-- credit_notes_all_own_company policy.
--
-- Project bcaffvpibpitpuqglszn.
-- APPLIED LIVE 2026-09-02 via Supabase MCP apply_migration, remote version
-- `20260902051630` / name `0043_credit_note_reason_details`.
--
-- This file is the DESIGN NOTE. The canonical, history-aligned migration (exact
-- applied SQL, so `supabase db push` will not re-run it) is:
--   supabase/migrations/20260902051630__0043_credit_note_reason_details.sql
-- Process deviation (applied before the Part-T pre-write review) is recorded in
-- docs/SEPTEMBER_2026_DATA_PLAN.md §7 and docs/CURRENT_TASKS.md.

alter table public.credit_notes
  add column if not exists reason_details text;

comment on column public.credit_notes.reason_details is
  'Free-text explanation, required by the UI when reason = ''other''. Null for the other reasons.';
