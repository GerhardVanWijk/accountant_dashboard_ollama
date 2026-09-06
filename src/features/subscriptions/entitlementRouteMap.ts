import type { EntitlementKey } from './entitlements';

/**
 * Route-prefix → entitlement key. Longest matching prefix wins. A path with
 * no entry (or one resolving to a core key) is never entitlement-gated.
 * This is the same idea as `permissionRouteMap.ts` but on the ENTITLEMENT
 * axis (Layer 2) — orthogonal to the permission axis (Layer 3).
 */
const RULES: [prefix: string, key: EntitlementKey][] = [
  ['/sales/credit-notes', 'sales_receipts'],
  ['/sales/receipts', 'sales_receipts'],
  ['/sales/customers', 'customers'],
  ['/sales', 'sales'],
  ['/purchases/vendors', 'suppliers'],
  ['/purchases/payments', 'purchasing_payments'],
  ['/purchases/aging', 'purchasing_payments'],
  ['/purchases', 'purchasing'],
  ['/banking', 'banking'],
  ['/inventory', 'inventory'],
  ['/accounting', 'general_ledger'],
  ['/financial-periods', 'general_ledger'],
  ['/tax/vat-return', 'vat'],
  ['/tax/rates', 'vat'],
  ['/tax/income-tax', 'income_tax'],
  ['/tax/provisional-tax', 'income_tax'],
  ['/tax/capital-gains', 'advanced_tax'],
  ['/tax/dividends', 'advanced_tax'],
  ['/tax/deferred-tax', 'advanced_tax'],
  ['/tax/expected-credit-losses', 'advanced_tax'],
  ['/reports', 'financial_statements'],
  ['/assets/depreciation', 'assets_depreciation'],
  ['/assets/disposals', 'assets_depreciation'],
  ['/assets/tax-register', 'assets_depreciation'],
  ['/assets', 'assets'],
  ['/payroll', 'payroll'],
  ['/compliance', 'compliance'],
  ['/related-parties', 'compliance'],
  ['/leases', 'compliance'],
  ['/foreign-exchange', 'foreign_exchange'],
  ['/admin/audit', 'audit_trail'],
  ['/admin/users', 'user_management'],
  ['/settings', 'settings'],
  ['/companies', 'settings'],
];

// longest-prefix-first so '/sales/credit-notes' beats '/sales'
const SORTED = [...RULES].sort((a, b) => b[0].length - a[0].length);

export function entitlementForPath(pathname: string): EntitlementKey | null {
  const hit = SORTED.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return hit ? hit[1] : null;
}
