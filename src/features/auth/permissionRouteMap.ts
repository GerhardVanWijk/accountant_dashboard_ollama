/**
 * Route -> required (feature, action) permission, for every route that has
 * a genuine matching entry in the real `permissions` catalog
 * (`public.permissions`).
 *
 * History:
 *  - M11 seeded the first eight features (customer_management, dashboard,
 *    gl, inventory, invoicing, payroll, reports, supplier_management,
 *    user_management) and their route gates.
 *  - FINAL CORE HARDENING (2026-09-05, migration 0064) added nine more
 *    features covering every previously-ungated core area: sales_documents
 *    (Quotes / Sales Orders / Credit Notes / Customer Receipts), fulfilment
 *    (Delivery Notes / Return Notes), purchasing (POs / Bills / Payments /
 *    Vendor activity), banking, assets, tax, compliance (incl. Related
 *    Parties / FX / Leases), financial_periods and audit.
 *
 * Route gates use `action: 'read'` — the coarse "can this user open the
 * page at all" check. Finer create/update/delete/post/export/import/manage
 * gates live on the individual controls (`useCanAccess()` in the feature
 * components), never here. `admin`/`superuser` bypass all of this via
 * `useCanAccess()` (see docs/PERMISSIONS.md).
 *
 * Still deliberately ungated (no matching permission, per the brief's "Do
 * not create permissions merely because a route exists"): `/companies`
 * (company profile — admin-oriented, folded into a future settings model),
 * `/settings` + `/settings/accounting` (link-hub, real model is Block C),
 * `/help`, `/admin/superuser` (RouteGuard already confines this to
 * superusers).
 */
export interface RoutePermission {
  feature: string;
  action?: string;
}

export const routePermissions: Record<string, RoutePermission> = {
  '/': { feature: 'dashboard', action: 'read' },

  // GL
  '/accounting/coa': { feature: 'gl', action: 'read' },
  '/accounting/journals': { feature: 'gl', action: 'read' },
  '/accounting/ledger': { feature: 'gl', action: 'read' },
  '/accounting/trial-balance': { feature: 'gl', action: 'read' },
  '/financial-periods': { feature: 'financial_periods', action: 'read' },

  // Sales
  '/sales/customers': { feature: 'customer_management', action: 'read' },
  '/sales/quotes': { feature: 'sales_documents', action: 'read' },
  '/sales/orders': { feature: 'sales_documents', action: 'read' },
  '/sales/credit-notes': { feature: 'sales_documents', action: 'read' },
  '/sales/receipts': { feature: 'sales_documents', action: 'read' },
  '/sales/delivery-notes': { feature: 'fulfilment', action: 'read' },
  '/sales/return-notes': { feature: 'fulfilment', action: 'read' },
  '/sales/invoices': { feature: 'invoicing', action: 'read' },

  // Purchases
  '/purchases/vendors': { feature: 'supplier_management', action: 'read' },
  '/purchases/orders': { feature: 'purchasing', action: 'read' },
  '/purchases/bills': { feature: 'purchasing', action: 'read' },
  '/purchases/payments': { feature: 'purchasing', action: 'read' },
  '/purchases/aging': { feature: 'purchasing', action: 'read' },

  // Banking
  '/banking/accounts': { feature: 'banking', action: 'read' },
  '/banking/transactions': { feature: 'banking', action: 'read' },
  '/banking/reconciliation': { feature: 'banking', action: 'read' },

  // Inventory
  '/inventory': { feature: 'inventory', action: 'read' },
  '/inventory/products': { feature: 'inventory', action: 'read' },
  '/inventory/categories': { feature: 'inventory', action: 'read' },
  '/inventory/warehouses': { feature: 'inventory', action: 'read' },
  '/inventory/movements': { feature: 'inventory', action: 'read' },

  // Assets
  '/assets/register': { feature: 'assets', action: 'read' },
  '/assets/depreciation': { feature: 'assets', action: 'read' },
  '/assets/disposals': { feature: 'assets', action: 'read' },
  '/assets/tax-register': { feature: 'assets', action: 'read' },

  // Payroll
  '/payroll/employees': { feature: 'payroll', action: 'read' },
  '/payroll/runs': { feature: 'payroll', action: 'read' },
  '/payroll/emp201': { feature: 'payroll', action: 'read' },
  '/payroll/emp501': { feature: 'payroll', action: 'read' },

  // Tax
  '/tax/rates': { feature: 'tax', action: 'read' },
  '/tax/vat-return': { feature: 'tax', action: 'read' },
  '/tax/income-tax': { feature: 'tax', action: 'read' },
  '/tax/capital-gains': { feature: 'tax', action: 'read' },
  '/tax/dividends': { feature: 'tax', action: 'read' },
  '/tax/provisional-tax': { feature: 'tax', action: 'read' },
  '/tax/deferred-tax': { feature: 'tax', action: 'read' },
  '/tax/expected-credit-losses': { feature: 'tax', action: 'read' },

  // Reports
  '/reports': { feature: 'reports', action: 'read' },
  '/reports/income-statement': { feature: 'reports', action: 'read' },
  '/reports/balance-sheet': { feature: 'reports', action: 'read' },
  '/reports/cash-flow': { feature: 'reports', action: 'read' },
  '/reports/customer-aging': { feature: 'reports', action: 'read' },
  '/reports/supplier-aging': { feature: 'reports', action: 'read' },
  '/reports/forecasting': { feature: 'reports', action: 'read' },

  // Compliance (incl. Related Parties, Foreign Exchange, Leases)
  '/compliance/dashboard': { feature: 'compliance', action: 'read' },
  '/compliance/public-interest-score': { feature: 'compliance', action: 'read' },
  '/compliance/reporting-standards': { feature: 'compliance', action: 'read' },
  '/related-parties/register': { feature: 'compliance', action: 'read' },
  '/related-parties/transactions': { feature: 'compliance', action: 'read' },
  '/foreign-exchange/rates': { feature: 'compliance', action: 'read' },
  '/foreign-exchange/calculator': { feature: 'compliance', action: 'read' },
  '/leases/register': { feature: 'compliance', action: 'read' },
  '/leases/amortization': { feature: 'compliance', action: 'read' },

  // Administration
  '/admin/users': { feature: 'user_management', action: 'read' },
  '/admin/audit': { feature: 'audit', action: 'read' },
  '/admin/audit-trail': { feature: 'audit', action: 'read' },
};

/** Looks up the exact route, then its longest matching prefix (e.g. `/payroll/employees/42` under `/payroll/employees`) — same prefix convention `sectionForPath()` in `src/lib/app/navigation.ts` already uses. */
export function permissionForPath(pathname: string): RoutePermission | undefined {
  if (routePermissions[pathname]) return routePermissions[pathname];
  const match = Object.keys(routePermissions)
    .filter((route) => route !== '/' && pathname.startsWith(`${route}/`))
    .sort((a, b) => b.length - a.length)[0];
  return match ? routePermissions[match] : undefined;
}
