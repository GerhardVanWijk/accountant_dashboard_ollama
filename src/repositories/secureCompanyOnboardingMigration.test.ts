import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * FINAL USER MANAGEMENT / ONBOARDING SECURITY FIX (2026-09-05) —
 * migration-contract coverage for 0065. The previous "add existing user"
 * tests mocked `addExistingUserToCompany` away entirely and so never
 * exercised the RLS failure that made it a silent no-op; these assertions
 * pin the SQL contract of the fix on the APPLIED migration file (same
 * static-SQL approach as `salesOrderInvoiceProjectionMigration.test.ts` /
 * `deliveryNotesMigrations.test.ts`). The live behaviour of every branch
 * was proven separately with a rollback-wrapped RLS session — see
 * docs/KNOWN_ISSUES.md.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const migrationFiles = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith('.sql')).sort();

function migration(logical: string): { file: string; sql: string } {
  const matches = migrationFiles.filter((n) => n.includes(`__${logical}_`));
  expect(matches, `logical migration ${logical}`).toHaveLength(1);
  return { file: matches[0], sql: readFileSync(join(MIGRATIONS_DIR, matches[0]), 'utf8') };
}

function code(logical: string): string {
  return migration(logical)
    .sql.split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

function version(logical: string): bigint {
  return BigInt(migration(logical).file.split('__')[0]);
}

describe('0065 — secure company onboarding', () => {
  const raw = migration('0065').sql;
  const sql = code('0065');

  it('sorts after 0064', () => {
    expect(version('0065')).toBeGreaterThan(version('0064'));
  });

  describe('add_existing_user_to_company RPC', () => {
    it('is SECURITY DEFINER with a locked search_path and a jsonb return', () => {
      expect(sql).toContain('create or replace function public.add_existing_user_to_company( p_user_id uuid, p_company_id uuid ) returns jsonb');
      expect(sql).toContain('security definer');
      expect(sql).toContain("set search_path to 'public'");
    });

    it('derives the caller from auth.uid() — never from a client-supplied argument', () => {
      expect(sql).toContain('v_actor uuid := (select auth.uid())');
      // the only parameters are the target user and the target company
      expect(sql).not.toMatch(/p_actor|p_admin|p_caller/);
    });

    it('rejects an unauthenticated caller and a non-admin caller', () => {
      expect(sql).toContain('if v_actor is null then');
      expect(sql).toContain("v_actor_role not in ('admin', 'superuser')");
      expect(sql).toContain('only a company administrator can add a user to a company');
    });

    it('validates the company exists and that an admin only acts for their own company', () => {
      expect(sql).toContain('from public.companies c where c.id = p_company_id and c.is_active');
      expect(sql).toContain("v_actor_role = 'admin' and p_company_id is distinct from v_actor_company");
    });

    it('locks the target row FOR UPDATE before deciding (concurrency: only one company can win)', () => {
      expect(sql).toContain('select * into v_target from public.profiles p where p.id = p_user_id for update');
    });

    it('refuses to touch a superuser account and refuses a self-operation', () => {
      expect(sql).toContain("if v_target.role = 'superuser' then");
      expect(sql).toContain('if p_user_id = v_actor then');
    });

    it('only assigns a currently-unassigned user and never moves one between companies', () => {
      expect(sql).toContain('if v_target.company_id is not null then');
      // same company => idempotent success; different company => hard error
      expect(sql).toContain("'status', 'already_in_company'");
      expect(sql).toContain('already a member of a company and cannot be added to another');
    });

    it('writes company_id ONLY (no role / is_active change) and NEVER treats 0 rows as success', () => {
      expect(sql).toMatch(/update public\.profiles set company_id = p_company_id, updated_at = now\(\) where id = p_user_id/);
      // the guarded not-found check immediately after the UPDATE
      const updateIdx = sql.indexOf('update public.profiles set company_id = p_company_id');
      const notFoundIdx = sql.indexOf('if not found then', updateIdx);
      expect(notFoundIdx).toBeGreaterThan(updateIdx);
      expect(sql).toContain('could not be added to the company');
    });

    it('writes its own audit row in the same transaction', () => {
      expect(sql).toContain('insert into public.audit_log_entries');
      expect(sql).toContain("'permission_changed', 'admin', 'profile'");
      expect(sql).toContain('added existing user to company');
    });

    it('is revoked from public/anon and granted only to authenticated', () => {
      expect(sql).toContain('revoke all on function public.add_existing_user_to_company(uuid, uuid) from public');
      expect(sql).toContain('revoke execute on function public.add_existing_user_to_company(uuid, uuid) from anon');
      expect(sql).toContain('grant execute on function public.add_existing_user_to_company(uuid, uuid) to authenticated');
    });
  });

  describe('DB-level admin self-lockout', () => {
    it('extends protect_profile_privileged_columns so an admin cannot demote or suspend their own row', () => {
      expect(sql).toContain('if old.id = (select auth.uid()) then');
      expect(sql).toContain("old.role = 'admin' and new.role is distinct from old.role");
      expect(sql).toContain('you cannot change your own administrator access level');
      expect(sql).toContain('if old.is_active and not new.is_active then');
      expect(sql).toContain('you cannot suspend your own account');
    });

    it('keeps superuser and the no-auth.uid() direct-DB connection as recovery paths (returned early, unchanged)', () => {
      const fnIdx = sql.indexOf('create or replace function public.protect_profile_privileged_columns()');
      const nullGuard = sql.indexOf('if (select auth.uid()) is null then return new', fnIdx);
      const superuserGuard = sql.indexOf("if public.get_my_role() = 'superuser' then return new", fnIdx);
      const selfLockout = sql.indexOf('if old.id = (select auth.uid()) then', fnIdx);
      expect(nullGuard).toBeGreaterThan(fnIdx);
      expect(superuserGuard).toBeGreaterThan(nullGuard);
      expect(selfLockout).toBeGreaterThan(superuserGuard);
    });

    it('re-closes the anon/authenticated EXECUTE grant that migration 0016 re-opened on the trigger function', () => {
      expect(sql).toContain('revoke all on function public.protect_profile_privileged_columns() from public');
      expect(sql).toContain('revoke execute on function public.protect_profile_privileged_columns() from anon');
      expect(sql).toContain('revoke execute on function public.protect_profile_privileged_columns() from authenticated');
    });
  });

  describe('user_roles company-integrity trigger', () => {
    it('adds a BEFORE INSERT OR UPDATE trigger backed by a SECURITY DEFINER function', () => {
      expect(sql).toContain('create or replace function public.enforce_user_role_company_integrity() returns trigger');
      expect(sql).toContain('security definer set search_path = public');
      expect(sql).toContain('before insert or update on public.user_roles for each row execute function public.enforce_user_role_company_integrity()');
    });

    it('requires the target profile to belong to the row company, and a custom role to belong to it too', () => {
      expect(sql).toContain('select company_id into v_target_company from public.profiles where id = new.user_id');
      expect(sql).toContain('if v_target_company is null then');
      expect(sql).toContain('not a member of any company yet');
      expect(sql).toContain('if v_target_company <> new.company_id then');
      expect(sql).toContain('belongs to a different company');
      expect(sql).toContain('select company_id into v_role_company from public.roles where id = new.role_id');
      expect(sql).toContain('v_role_company is not null and v_role_company <> new.company_id');
    });

    it('bypasses for superuser and the no-auth.uid() direct-DB connection', () => {
      expect(sql).toContain("if (select auth.uid()) is null or public.get_my_role() = 'superuser' then return new");
    });
  });

  it('creates NO row-level-security policy and touches NO business/accounting table', () => {
    expect(sql).not.toMatch(/create policy|drop policy|alter policy/);
    expect(sql).not.toMatch(/\balter table\b/);
    expect(sql).not.toMatch(/insert into public\.(journal|invoices|bills|stock_movements|accounts)\b/);
  });

  it('ends with an observability assertion block that verifies the grants it just set', () => {
    expect(sql).toContain("to_regprocedure('public.add_existing_user_to_company(uuid, uuid)') is null");
    expect(sql).toContain("has_function_privilege('anon', 'public.add_existing_user_to_company(uuid, uuid)', 'execute')");
    expect(raw).toContain('user_roles_company_integrity');
  });
});
