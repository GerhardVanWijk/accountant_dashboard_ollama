import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { routePermissions } from '@/features/auth/permissionRouteMap';

/**
 * SQL-contract cover for migration 0075 (Administration permission catalog
 * + user_roles / profiles audit triggers). Live behaviour — cross-company
 * isolation of documents / audit / access log / notifications / notification
 * state / profiles / mappings, a role assign/unassign writing an audit row,
 * a profile access-level change writing an audit row — was proven with
 * rollback-wrapped RLS sessions (see docs/PERMISSIONS.md / docs/SECURITY.md).
 */

const dir = join(process.cwd(), 'supabase', 'migrations');
const file = readdirSync(dir).find((n) => n.includes('__0075_'))!;
const sql = readFileSync(join(dir, file), 'utf8').replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();

describe('0075 — administration permissions + audit', () => {
  it('sorts after 0074', () => {
    const v = (l: string) => BigInt(readdirSync(dir).find((n) => n.includes(`__${l}_`))!.split('__')[0]);
    expect(v('0075')).toBeGreaterThan(v('0074'));
  });

  it('seeds the five Administration permission features additively', () => {
    for (const f of ['documents', 'notifications', 'settings', 'accounting_settings', 'billing']) {
      expect(sql).toContain(`'${f}',`);
    }
    expect(sql).toContain('on conflict (feature, action) do nothing');
    // asserts the no-lockout invariant via its own guard
    expect(sql).toContain("v_grants <> 33");
  });

  it('grants billing to no system role (admin/superuser only)', () => {
    // billing appears in the permission list but never in the grant_map values
    const grantSection = sql.slice(sql.indexOf('grant_map'), sql.indexOf('insert into public.role_permissions'));
    expect(grantSection).not.toContain("'billing'");
  });

  it('adds trigger-based semantic audit for role and access-level changes', () => {
    expect(sql).toContain('create trigger user_roles_audit_aid after insert or delete on public.user_roles');
    expect(sql).toContain("'role_assigned', 'admin', 'userrole'");
    expect(sql).toContain("'role_unassigned', 'admin', 'userrole'");
    expect(sql).toContain('create trigger profiles_access_audit_au after update on public.profiles');
    expect(sql).toContain("'user_access_changed', 'admin', 'profile'");
  });

  it('audit payloads carry no secrets, email or PII beyond role/active flag', () => {
    expect(sql).not.toMatch(/jsonb_build_object\([^)]*\b(email|password|token|token_hash|first_name|last_name)\b/);
  });

  it('makes no RLS or accounting-table schema change', () => {
    expect(sql).not.toMatch(/create policy|alter table public\.(companies|profiles|journal_lines|accounts) add column/);
  });
});

describe('permissionRouteMap — Administration routes are gated', () => {
  it('every Administration route resolves to an Administration permission feature', () => {
    expect(routePermissions['/documents']).toEqual({ feature: 'documents', action: 'read' });
    expect(routePermissions['/notifications']).toEqual({ feature: 'notifications', action: 'read' });
    expect(routePermissions['/settings']).toEqual({ feature: 'settings', action: 'read' });
    expect(routePermissions['/settings/accounting']).toEqual({ feature: 'accounting_settings', action: 'read' });
    expect(routePermissions['/settings/subscription']).toEqual({ feature: 'billing', action: 'read' });
  });
});
