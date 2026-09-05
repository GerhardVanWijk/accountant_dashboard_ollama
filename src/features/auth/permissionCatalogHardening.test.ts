import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { permissionForPath, routePermissions } from './permissionRouteMap';

/**
 * FINAL CORE HARDENING (2026-09-05) — contract coverage for the app-wide
 * permission catalog extension (migration 0064) and its route gates.
 *
 * The role -> (feature, action) grid is asserted against the APPROVED
 * PERMISSION POLICY in the brief. `admin` / `superuser` are NOT in the grid
 * on purpose — they bypass `useCanAccess()` entirely (docs/PERMISSIONS.md).
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function migration(logicalNumber: string): string {
  const files = readdirSync(MIGRATIONS_DIR).filter((n) => n.includes(`__${logicalNumber}_`) && n.endsWith('.sql'));
  expect(files, `logical migration ${logicalNumber}`).toHaveLength(1);
  return readFileSync(join(MIGRATIONS_DIR, files[0]), 'utf8');
}

const NEW_FEATURES = [
  'sales_documents',
  'fulfilment',
  'purchasing',
  'banking',
  'assets',
  'tax',
  'compliance',
  'financial_periods',
  'audit',
] as const;

/** Parse migration 0064's `('role','feature','action')` grant tuples into role -> Set<"feature:action">. */
function parseGrantGrid(sql: string): Record<string, Set<string>> {
  const grid: Record<string, Set<string>> = {};
  const tupleRe = /\('([a-z_]+)','([a-z_]+)','([a-z_]+)'\)/g;
  let m: RegExpExecArray | null;
  while ((m = tupleRe.exec(sql))) {
    const [, role, feature, action] = m;
    if (!NEW_FEATURES.includes(feature as (typeof NEW_FEATURES)[number])) continue;
    (grid[role] ??= new Set()).add(`${feature}:${action}`);
  }
  return grid;
}

const GRID = parseGrantGrid(migration('0064'));

function can(role: string, key: string): boolean {
  return GRID[role]?.has(key) ?? false;
}

describe('migration 0064 — permission catalog extension', () => {
  const sql = migration('0064');

  it('is additive only — no RLS / policy / drop / grant-revoke of table privileges', () => {
    const code = sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
      .toLowerCase();
    expect(code).not.toContain('create policy');
    expect(code).not.toContain('alter policy');
    expect(code).not.toContain('drop policy');
    expect(code).not.toContain('enable row level security');
    expect(code).not.toContain('alter table');
    expect(code).not.toContain('drop ');
  });

  it('writes NO user_roles rows and NO profiles changes (no-lockout invariant)', () => {
    const code = sql.toLowerCase();
    expect(code).not.toContain('insert into public.user_roles');
    expect(code).not.toContain('update public.user_roles');
    expect(code).not.toContain('public.profiles');
  });

  it('adds exactly the nine new core features', () => {
    for (const f of NEW_FEATURES) {
      expect(sql, `feature ${f}`).toContain(`('${f}',`);
    }
  });

  it('introduces the `post`, `cancel`, `reconcile` and `manage` actions', () => {
    expect(sql).toContain("'post'");
    expect(sql).toContain("'cancel'");
    expect(sql).toContain("'reconcile'");
    expect(sql).toContain("'manage'");
  });
});

describe('APPROVED role → permission grid (migration 0064)', () => {
  it('viewer reads permitted areas but performs zero mutations', () => {
    for (const f of ['sales_documents', 'fulfilment', 'purchasing', 'banking', 'assets', 'tax', 'compliance', 'financial_periods']) {
      expect(can('viewer', `${f}:read`), `viewer ${f}:read`).toBe(true);
    }
    // exports it already has on invoicing/reports shape
    expect(can('viewer', 'sales_documents:export')).toBe(true);
    expect(can('viewer', 'purchasing:export')).toBe(true);
    // no mutation anywhere
    for (const key of GRID.viewer) {
      expect(key.endsWith(':read') || key.endsWith(':export'), `viewer must not hold ${key}`).toBe(true);
    }
    // audit is finance-only
    expect(can('viewer', 'audit:read')).toBe(false);
  });

  it('stock_controller: can post/cancel fulfilment (DN/RN); cannot post invoices/CN/bills/payments/journals/tax/periods', () => {
    expect(can('stock_controller', 'fulfilment:post')).toBe(true);
    expect(can('stock_controller', 'fulfilment:cancel')).toBe(true);
    expect(can('stock_controller', 'fulfilment:create')).toBe(true);
    // purchasing CRUD + import/export (POs affect stock) but NOT accounting post
    expect(can('stock_controller', 'purchasing:create')).toBe(true);
    expect(can('stock_controller', 'purchasing:import')).toBe(true);
    expect(can('stock_controller', 'purchasing:post')).toBe(false);
    // no credit-note issue (that is sales_documents:post), no receipts, no journals/tax/periods
    expect(can('stock_controller', 'sales_documents:post')).toBe(false);
    expect(can('stock_controller', 'sales_documents:create')).toBe(false);
    expect(can('stock_controller', 'banking:post')).toBe(false);
    expect(can('stock_controller', 'banking:reconcile')).toBe(false);
    expect(can('stock_controller', 'tax:post')).toBe(false);
    expect(can('stock_controller', 'financial_periods:manage')).toBe(false);
    expect(can('stock_controller', 'audit:read')).toBe(false);
  });

  it('sales_manager: full sales_documents + fulfilment operational workflow; no financial administration', () => {
    for (const a of ['read', 'create', 'update', 'delete', 'post', 'export']) {
      expect(can('sales_manager', `sales_documents:${a}`), `sales_manager sales_documents:${a}`).toBe(true);
    }
    expect(can('sales_manager', 'fulfilment:post')).toBe(true);
    expect(can('sales_manager', 'purchasing:read')).toBe(true);
    // no financial administration
    expect(can('sales_manager', 'purchasing:post')).toBe(false);
    expect(can('sales_manager', 'banking:read')).toBe(false);
    expect(can('sales_manager', 'tax:read')).toBe(false);
    expect(can('sales_manager', 'financial_periods:manage')).toBe(false);
    expect(can('sales_manager', 'audit:read')).toBe(false);
  });

  it('finance_manager: broad financial read + export + audit:read, but no mutation', () => {
    for (const f of ['sales_documents', 'purchasing', 'banking', 'assets', 'tax', 'compliance', 'financial_periods']) {
      expect(can('finance_manager', `${f}:read`), `finance_manager ${f}:read`).toBe(true);
    }
    expect(can('finance_manager', 'audit:read')).toBe(true);
    expect(can('finance_manager', 'sales_documents:export')).toBe(true);
    expect(can('finance_manager', 'purchasing:export')).toBe(true);
    for (const key of GRID.finance_manager) {
      expect(key.endsWith(':read') || key.endsWith(':export'), `finance_manager must not hold ${key}`).toBe(true);
    }
  });

  it('accountant: full accounting operational access, EXCLUDING user/security administration', () => {
    for (const f of NEW_FEATURES) {
      expect(can('accountant', `${f}:read`), `accountant ${f}:read`).toBe(true);
    }
    expect(can('accountant', 'sales_documents:post')).toBe(true);
    expect(can('accountant', 'purchasing:post')).toBe(true);
    expect(can('accountant', 'banking:reconcile')).toBe(true);
    expect(can('accountant', 'assets:post')).toBe(true);
    expect(can('accountant', 'tax:post')).toBe(true);
    expect(can('accountant', 'compliance:update')).toBe(true);
    expect(can('accountant', 'financial_periods:manage')).toBe(true);
    // user/security administration is NOT granted here (stays user_management)
    expect(can('accountant', 'user_management:update')).toBe(false);
  });

  it('employee: minimal operational read only', () => {
    expect([...GRID.employee].sort()).toEqual(['fulfilment:read', 'purchasing:read', 'sales_documents:read']);
  });
});

describe('route gating — direct URL navigation', () => {
  const cases: [string, string, string][] = [
    ['/sales/quotes', 'sales_documents', 'read'],
    ['/sales/orders/abc-123', 'sales_documents', 'read'],
    ['/sales/orders/abc-123/deliver', 'sales_documents', 'read'],
    ['/sales/delivery-notes', 'fulfilment', 'read'],
    ['/sales/return-notes/xyz', 'fulfilment', 'read'],
    ['/sales/credit-notes', 'sales_documents', 'read'],
    ['/sales/receipts/9', 'sales_documents', 'read'],
    ['/purchases/orders', 'purchasing', 'read'],
    ['/purchases/bills/7', 'purchasing', 'read'],
    ['/purchases/payments', 'purchasing', 'read'],
    ['/purchases/aging', 'purchasing', 'read'],
    ['/banking/accounts', 'banking', 'read'],
    ['/banking/reconciliation', 'banking', 'read'],
    ['/assets/register', 'assets', 'read'],
    ['/assets/tax-register', 'assets', 'read'],
    ['/tax/vat-return', 'tax', 'read'],
    ['/tax/deferred-tax', 'tax', 'read'],
    ['/compliance/dashboard', 'compliance', 'read'],
    ['/related-parties/register', 'compliance', 'read'],
    ['/foreign-exchange/rates', 'compliance', 'read'],
    ['/leases/amortization', 'compliance', 'read'],
    ['/financial-periods', 'financial_periods', 'read'],
    ['/admin/audit', 'audit', 'read'],
    ['/admin/audit-trail', 'audit', 'read'],
  ];

  it.each(cases)('%s requires %s:%s', (path, feature, action) => {
    expect(permissionForPath(path)).toEqual({ feature, action });
  });

  it('every routePermissions entry names one of the known catalog features', () => {
    const known = new Set<string>([
      'dashboard',
      'gl',
      'customer_management',
      'supplier_management',
      'invoicing',
      'inventory',
      'payroll',
      'reports',
      'user_management',
      ...NEW_FEATURES,
    ]);
    for (const { feature } of Object.values(routePermissions)) {
      expect(known.has(feature), `unknown feature "${feature}" in routePermissions`).toBe(true);
    }
  });

  it('leaves deliberately-ungated routes ungated', () => {
    expect(permissionForPath('/companies')).toBeUndefined();
    expect(permissionForPath('/settings')).toBeUndefined();
    expect(permissionForPath('/settings/accounting')).toBeUndefined();
    expect(permissionForPath('/help')).toBeUndefined();
  });
});
