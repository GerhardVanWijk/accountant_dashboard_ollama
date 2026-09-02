-- 0043_credit_note_reason_details
--
-- Canonical migration for the additive `credit_notes.reason_details` column.
-- This file mirrors, verbatim, the SQL applied to the remote project on
-- 2026-09-02 via the Supabase MCP `apply_migration` call recorded as
-- migration version `20260902051630` / name `0043_credit_note_reason_details`
-- (see `supabase_migrations.schema_migrations`). It is reproduced here so the
-- repository migration history matches the remote history exactly and a future
-- `supabase db push` treats 0043 as already applied rather than re-running it.
--
-- DO NOT reapply. DO NOT edit the SQL below — it must stay byte-for-byte the
-- applied statement. The design rationale lives in
-- `docs/db-changes/0043_credit_note_reason_details.sql`.
--
-- Shape: one nullable text column, no default, no backfill, no change to any
-- existing column. Every existing `credit_notes` row keeps working unchanged.
-- RLS: none needed — column-level, inherits `credit_notes_all_own_company`.

alter table public.credit_notes
  add column if not exists reason_details text;

comment on column public.credit_notes.reason_details is
  'Free-text explanation, required by the UI when reason = ''other''. Null for the other reasons.';
