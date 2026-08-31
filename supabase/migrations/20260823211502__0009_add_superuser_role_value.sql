-- Backfilled from supabase_migrations.schema_migrations (already applied to the live project).
-- version: 20260823211502 · name: 0009_add_superuser_role_value

-- Phase T (Multi-Tenant Auth + Role System + Superuser Dashboard).
-- Own migration: Postgres forbids using a newly-added enum value in the
-- same transaction that adds it, so this is split from 0010 which
-- references 'superuser' in RLS policies.
alter type public.profile_role add value if not exists 'superuser';
