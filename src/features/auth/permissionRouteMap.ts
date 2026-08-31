/**
 * Route -> required (feature, action) permission, for every route that has
 * a genuine matching entry in the real `permissions` catalog
 * (`public.permissions`, migration 0010 — inspected directly against the
 * live database at the start of M11). This is deliberately NOT a
 * one-mapping-per-route list: most of this app's modules have no
 * corresponding permission row at all — see docs/PERMISSIONS.md's gap
 * table — and per the M11 brief ("Do not blindly gate every route with
 * guessed permissions. Use only existing permission definitions.") those
 * routes are left ungated here rather than inventing a plausible-looking
 * key for them.
 *
 * The real catalog only covers eight features: customer_management,
 * dashboard, gl, inventory, invoicing, payroll, reports, supplier_management.
 * Every route below maps onto one of those; every route not listed here is
 * intentionally left without route-level gating.
 */
export interface RoutePermission {
  feature: string;
  action?: string;
}

export const routePermissions: Record<string, RoutePermission> = {
  '/': { feature: 'dashboard', action: 'read' },
  '/sales/customers': { feature: 'customer_management', action: 'read' },
  '/purchases/vendors': { feature: 'supplier_management', action: 'read' },
  '/sales/invoices': { feature: 'invoicing', action: 'read' },
  '/inventory': { feature: 'inventory', action: 'read' },
  '/inventory/products': { feature: 'inventory', action: 'read' },
  '/inventory/categories': { feature: 'inventory', action: 'read' },
  '/inventory/warehouses': { feature: 'inventory', action: 'read' },
  '/inventory/movements': { feature: 'inventory', action: 'read' },
  '/payroll/employees': { feature: 'payroll', action: 'read' },
  '/payroll/runs': { feature: 'payroll', action: 'read' },
  '/payroll/emp201': { feature: 'payroll', action: 'read' },
  '/payroll/emp501': { feature: 'payroll', action: 'read' },
  '/accounting/coa': { feature: 'gl', action: 'read' },
  '/accounting/journals': { feature: 'gl', action: 'read' },
  '/accounting/ledger': { feature: 'gl', action: 'read' },
  '/accounting/trial-balance': { feature: 'gl', action: 'read' },
  '/reports': { feature: 'reports', action: 'read' },
  '/reports/income-statement': { feature: 'reports', action: 'read' },
  '/reports/balance-sheet': { feature: 'reports', action: 'read' },
  '/reports/cash-flow': { feature: 'reports', action: 'read' },
  '/reports/customer-aging': { feature: 'reports', action: 'read' },
  '/reports/supplier-aging': { feature: 'reports', action: 'read' },
  '/admin/users': { feature: 'user_management', action: 'read' },
};

/** Looks up the exact route, then its longest matching prefix (e.g. `/payroll/employees/42` under `/payroll/employees`) — same prefix convention `sectionForPath()` in `src/lib/app/navigation.ts` already uses. */
export function permissionForPath(pathname: string): RoutePermission | undefined {
  if (routePermissions[pathname]) return routePermissions[pathname];
  const match = Object.keys(routePermissions)
    .filter((route) => route !== '/' && pathname.startsWith(`${route}/`))
    .sort((a, b) => b.length - a.length)[0];
  return match ? routePermissions[match] : undefined;
}
