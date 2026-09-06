import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * SQL-contract cover for migration 0070 (Superuser → Vertex Platform
 * Administration Console). Live behaviour of every branch — client
 * suspend/reactivate, get_my_company_id() returning NULL for a suspended
 * member, the demo staying unaffected, manual subscription override,
 * member administration, the non-superuser rejections, bookkeeper grants —
 * was proven with rollback-wrapped RLS sessions (see
 * docs/SUPERUSER_PLATFORM_ADMIN.md and docs/KNOWN_ISSUES.md).
 */

const dir = join(process.cwd(), 'supabase', 'migrations');
const raw = readFileSync(join(dir, readdirSync(dir).find((n) => n.includes('__0070_'))!), 'utf8');
const sql = raw.replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();

describe('0070 — superuser platform console', () => {
  it('sorts after 0069', () => {
    const v = (l: string) => BigInt(readdirSync(dir).find((n) => n.includes(`__${l}_`))!.split('__')[0]);
    expect(v('0070')).toBeGreaterThan(v('0069'));
  });

  it('client suspension enforcement: get_my_company_id() gates on the company being active', () => {
    // the replaced helper now joins companies and requires is_active
    expect(sql).toContain('join public.companies c on c.id = p.company_id and c.is_active = true');
    // it stays SECURITY DEFINER + still filters the profile's own is_active
    expect(sql).toContain('create or replace function public.get_my_company_id() returns uuid');
    expect(sql).toContain('and p.is_active = true');
  });

  it('my_workspace_suspended() lets a blocked member detect the state, authenticated-only', () => {
    expect(sql).toContain('create or replace function public.my_workspace_suspended() returns boolean');
    expect(sql).toContain('and c.is_active = false');
    expect(sql).toContain('revoke execute on function public.my_workspace_suspended() from anon');
    expect(sql).toContain('grant  execute on function public.my_workspace_suspended() to authenticated'.replace(/\s+/g, ' '));
  });

  it('set_company_suspended is superuser-only, audited, and preserves data', () => {
    expect(sql).toContain("if v_uid is null or public.get_my_role() is distinct from 'superuser' then");
    expect(sql).toContain('add column if not exists suspended_at');
    expect(sql).toContain('add column if not exists suspension_reason');
    // writes an audit row on the 'platform' module, and never deletes an
    // accounting / document / profile row (detaching a member's user_roles
    // rows on "remove from company" is the only DELETE and is expected).
    expect(sql).toContain("'platform', 'company', p_company_id::text");
    expect(sql).not.toMatch(/delete from public\.(journal_entries|journal_lines|accounts|invoices|bills|stock_movements|customers|suppliers|products|profiles|companies)\b/);
  });

  it('every superuser guard uses IS DISTINCT FROM so a NULL role (suspended actor) is blocked, not bypassed', () => {
    expect(sql).not.toContain("public.get_my_role() <> 'superuser'");
    const guards = sql.match(/public\.get_my_role\(\) is distinct from 'superuser'/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(8);
  });

  it('manual subscription override is marked provider = manual and never claims a Paystack payment', () => {
    expect(sql).toContain("provider = 'manual'");
    expect(sql).toContain("values (p_company_id, v_plan_id, p_status, 'manual'");
    expect(sql).toContain('manual / superuser subscription override');
    // it does not fabricate payment / paid / revenue language
    expect(sql).not.toContain('payment_successful');
    expect(sql).not.toContain('amount_paid');
  });

  it('member administration cannot touch a superuser, act on self, or grant superuser', () => {
    expect(sql).toContain("if v_target.role = 'superuser' then");
    expect(sql).toContain('a superuser account cannot be modified here');
    expect(sql).toContain("if p_profile_role = 'superuser' then");
    expect(sql).toContain('if p_user_id = v_uid then');
    // last-active-admin guard
    expect(sql).toContain("where p.company_id = v_target.company_id and p.role = 'admin' and p.is_active) <= 1");
  });

  it('superuser gets its own audited invitation RPCs (0069 ones are admin-of-own-company only)', () => {
    expect(sql).toContain('create or replace function public.superuser_create_company_invitation');
    expect(sql).toContain('create or replace function public.superuser_revoke_company_invitation');
    // still hash-only, 7-day, single-use
    expect(sql).toContain("encode(extensions.digest(v_token, 'sha256'), 'hex')");
    expect(sql).toContain("interval '7 days'");
  });

  it('bookkeeper is added as a SYSTEM role only — the profile_role enum is untouched', () => {
    expect(sql).toContain("insert into public.roles (name, description, is_custom, company_id) select 'bookkeeper'");
    expect(sql).toContain('false, null');
    // NO enum change
    expect(sql).not.toMatch(/alter type public\.profile_role add value/);
    // and it is NOT silently mapped to accountant
    expect(sql).not.toMatch(/bookkeeper.*=.*accountant/);
  });

  it('bookkeeper is denied the security / platform-administration permissions', () => {
    // the migration's own observability block asserts this
    expect(sql).toContain("p.feature = 'user_management'");
    expect(sql).toContain("(p.feature = 'audit' and p.action = 'read')");
    expect(sql).toContain("(p.feature = 'financial_periods' and p.action = 'manage')");
    expect(sql).toContain("(p.feature = 'tax' and p.action = 'post')");
    expect(sql).toContain('bookkeeper was granted a forbidden permission');
    // and the wanted list never contains a user_management grant
    expect(sql).not.toMatch(/\('user_management','/);
  });

  it('adds a superuser cross-company read policy on audit_log_entries and keeps the company-scoped one', () => {
    expect(sql).toContain('create policy audit_log_entries_select_superuser on public.audit_log_entries');
    expect(sql).toContain("using (public.get_my_role() = 'superuser')");
    // the existing policy is not dropped
    expect(sql).not.toContain('drop policy if exists audit_log_entries_select_own_company');
  });

  it('platform read functions are superuser-only and expose no financial data', () => {
    for (const fn of ['platform_admin_metrics', 'platform_admin_company_users', 'platform_admin_client_setup']) {
      expect(sql).toContain(`revoke execute on function public.${fn}`);
    }
    // client setup returns COUNTS only — never a balance / journal / invoice
    expect(sql).toContain("'accountcount', (select count(*) from public.accounts where company_id = p_company_id)");
    expect(sql).not.toMatch(/select .*sum\(.*debit|select .*sum\(.*credit|from public\.journal_lines|balance/);
  });

  it('writes NO destructive statement against any accounting table and creates no journal rows', () => {
    expect(sql).not.toMatch(/drop table|truncate/);
    expect(sql).not.toMatch(/insert into public\.(journal_entries|journal_lines|accounts)\b/);
  });
});
