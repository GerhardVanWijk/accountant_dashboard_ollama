/**
 * Client-side mirror of `public.subscription_features` + `plan_features`
 * (migration 0068). The DATABASE is the source of truth — the resolver
 * `company_entitlements()` is authoritative and enforced server-side.
 * This module exists so the frontend can render the pricing page, the
 * upgrade page and the sidebar without a network round-trip for static
 * data, and `subscriptionCatalogue.test.ts` fails the build if it drifts
 * from the migration.
 */

export const ENTITLEMENT_KEYS = [
  // core — always available, any plan or no plan
  'dashboard', 'customers', 'suppliers', 'user_management', 'settings',
  // plan features
  'sales', 'sales_receipts', 'purchasing', 'purchasing_payments', 'banking',
  'vat', 'income_tax', 'advanced_tax', 'general_ledger', 'financial_statements',
  'assets', 'assets_depreciation', 'inventory', 'compliance', 'audit_trail',
  // add-ons (in no base plan)
  'payroll', 'foreign_exchange',
] as const;

export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number];

export const CORE_ENTITLEMENTS: readonly EntitlementKey[] = [
  'dashboard', 'customers', 'suppliers', 'user_management', 'settings',
];

/** Human labels — mirror `subscription_features.name`. */
export const ENTITLEMENT_LABELS: Record<EntitlementKey, string> = {
  dashboard: 'Dashboard',
  customers: 'Customers',
  suppliers: 'Suppliers',
  user_management: 'Users & access',
  settings: 'Settings',
  sales: 'Invoicing & quotes',
  sales_receipts: 'Credit notes & receipts',
  purchasing: 'Bills & expenses',
  purchasing_payments: 'Supplier payments & aging',
  banking: 'Bank import & reconciliation',
  vat: 'VAT',
  income_tax: 'Income & provisional tax',
  advanced_tax: 'Advanced tax',
  general_ledger: 'General ledger',
  financial_statements: 'Financial statements',
  assets: 'Fixed asset register',
  assets_depreciation: 'Depreciation & disposals',
  inventory: 'Inventory & warehouses',
  compliance: 'Compliance & related parties',
  audit_trail: 'Audit trail',
  payroll: 'Payroll',
  foreign_exchange: 'Foreign exchange toolkit',
};

export interface PlanCatalogueEntry {
  code: 'starter' | 'growth' | 'premium';
  name: string;
  blurb: string;
  priceCents: number;
  includedUsers: number;
  popular?: boolean;
  /** Non-core feature keys this plan unlocks — mirrors `plan_features`. */
  features: EntitlementKey[];
}

/** Mirrors `subscription_plans` + `plan_features` (0068 seed). */
export const PLAN_CATALOGUE: PlanCatalogueEntry[] = [
  {
    code: 'starter',
    name: 'Starter',
    blurb: 'Essential bookkeeping for sole proprietors and small businesses.',
    priceCents: 19900,
    includedUsers: 1,
    features: ['sales', 'purchasing', 'banking', 'vat', 'financial_statements', 'assets'],
  },
  {
    code: 'growth',
    name: 'Growth',
    blurb: 'Complete accounting for growing businesses and bookkeepers.',
    priceCents: 44900,
    includedUsers: 3,
    popular: true,
    features: [
      'sales', 'purchasing', 'banking', 'vat', 'financial_statements', 'assets',
      'sales_receipts', 'purchasing_payments', 'income_tax', 'general_ledger', 'audit_trail',
    ],
  },
  {
    code: 'premium',
    name: 'Premium',
    blurb: 'Advanced accounting, reporting and operational tools for established businesses.',
    priceCents: 89900,
    includedUsers: 10,
    features: [
      'sales', 'purchasing', 'banking', 'vat', 'financial_statements', 'assets',
      'sales_receipts', 'purchasing_payments', 'income_tax', 'general_ledger', 'audit_trail',
      'advanced_tax', 'assets_depreciation', 'inventory', 'compliance',
    ],
  },
];

export const PLAN_BY_CODE = new Map(PLAN_CATALOGUE.map((p) => [p.code, p]));

export function formatZarFromCents(cents: number): string {
  return `R ${Math.round(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
}

/** The lowest plan that includes a given feature — for "Upgrade to X" copy. */
export function lowestPlanFor(feature: EntitlementKey): PlanCatalogueEntry | undefined {
  return PLAN_CATALOGUE.find((p) => p.features.includes(feature));
}
