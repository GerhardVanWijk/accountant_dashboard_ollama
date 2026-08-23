import type { IconName } from '@/config/icons';

/**
 * Top-bar navigation model, derived 1:1 from docs/ROUTES.md. Keep this
 * in sync with src/app/router.tsx — every route must have a nav entry
 * and vice versa (docs/DO_NOT_BREAK.md: "Navigation updated for new
 * routes").
 *
 * Consumed by the horizontal top nav (src/components/layout/Topbar.tsx +
 * MobileNavMenu.tsx) per docs/DESIGN_SYSTEM.md § Navigation Layout: one
 * top-level domain tab per section (icon + label), with a dropdown for
 * sections with more than one route and direct navigation for
 * single-route sections.
 */
export interface NavItem {
  path: string;
  label: string;
  /** Registry key from src/config/icons.ts. */
  icon: IconName;
}

export interface NavSection {
  /** Matches the "Navigation Section" column in docs/ROUTES.md. */
  section: string;
  /** Top-level tab display label; falls back to `section` when unset. */
  tabLabel?: string;
  /** Registry key from src/config/icons.ts for the top-level tab. */
  icon: IconName;
  items: NavItem[];
}

export const navigation: NavSection[] = [
  {
    section: 'Sidebar Top',
    tabLabel: 'Dashboard',
    icon: 'dashboard',
    items: [{ path: '/', label: 'Executive Overview', icon: 'dashboard' }],
  },
  {
    section: 'Accounting',
    icon: 'accounting',
    items: [
      { path: '/accounting/coa', label: 'Chart of Accounts', icon: 'accounting' },
      { path: '/accounting/journals', label: 'General Journals', icon: 'journals' },
      { path: '/accounting/ledger', label: 'General Ledger Detail', icon: 'ledger' },
      { path: '/accounting/trial-balance', label: 'Trial Balance', icon: 'trialBalance' },
    ],
  },
  {
    section: 'Sales',
    icon: 'sales',
    items: [
      { path: '/sales/customers', label: 'Customer Directory', icon: 'customers' },
      { path: '/sales/quotes', label: 'Quotes', icon: 'quotes' },
      { path: '/sales/orders', label: 'Sales Orders', icon: 'salesOrders' },
      { path: '/sales/invoices', label: 'Sales Invoices', icon: 'invoices' },
      { path: '/sales/credit-notes', label: 'Credit Notes', icon: 'creditNotes' },
      { path: '/sales/receipts', label: 'Customer Receipts', icon: 'customerReceipts' },
    ],
  },
  {
    section: 'Purchases',
    icon: 'purchases',
    items: [
      { path: '/purchases/vendors', label: 'Vendor Directory', icon: 'suppliers' },
      { path: '/purchases/orders', label: 'Purchase Orders', icon: 'purchaseOrders' },
      { path: '/purchases/bills', label: 'Supplier Bills', icon: 'bills' },
      { path: '/purchases/payments', label: 'Payment Register', icon: 'payments' },
      { path: '/purchases/aging', label: 'Vendor Aging', icon: 'vendorAging' },
    ],
  },
  {
    section: 'Banking',
    icon: 'banking',
    items: [
      { path: '/banking/accounts', label: 'Bank Accounts', icon: 'banking' },
      { path: '/banking/transactions', label: 'Bank Transactions', icon: 'bankTransactions' },
      { path: '/banking/reconciliation', label: 'Bank Reconciliation', icon: 'reconciliation' },
    ],
  },
  {
    section: 'Inventory',
    icon: 'inventory',
    items: [
      { path: '/inventory/products', label: 'Products & Services', icon: 'products' },
      { path: '/inventory/warehouses', label: 'Multi-Warehouse Stock', icon: 'warehouses' },
    ],
  },
  {
    section: 'Fixed Assets',
    icon: 'assets',
    items: [
      { path: '/assets/register', label: 'Asset Register', icon: 'assets' },
      { path: '/assets/depreciation', label: 'Depreciation', icon: 'trendDown' },
      { path: '/assets/disposals', label: 'Disposals', icon: 'creditNotes' },
      { path: '/assets/tax-register', label: 'Tax Register', icon: 'tax' },
    ],
  },
  {
    section: 'Payroll',
    icon: 'payroll',
    items: [
      { path: '/payroll/employees', label: 'Employee Directory', icon: 'employees' },
      { path: '/payroll/runs', label: 'Payroll Runs', icon: 'payments' },
      { path: '/payroll/emp201', label: 'EMP201 Monthly Return', icon: 'tax' },
      { path: '/payroll/emp501', label: 'EMP501 Reconciliation', icon: 'reconciliation' },
    ],
  },
  {
    section: 'Tax',
    icon: 'tax',
    items: [
      { path: '/tax/rates', label: 'Tax Rates', icon: 'settings' },
      { path: '/tax/vat-return', label: 'VAT201 Reporting', icon: 'tax' },
      { path: '/tax/income-tax', label: 'Income Tax', icon: 'tax' },
      { path: '/tax/capital-gains', label: 'Capital Gains Tax', icon: 'tax' },
      { path: '/tax/dividends', label: 'Dividends Tax', icon: 'dividends' },
      { path: '/tax/provisional-tax', label: 'Provisional Tax', icon: 'tax' },
      { path: '/tax/deferred-tax', label: 'Deferred Tax', icon: 'tax' },
      { path: '/tax/expected-credit-losses', label: 'Expected Credit Losses', icon: 'tax' },
    ],
  },
  {
    section: 'Reports',
    icon: 'reports',
    items: [
      { path: '/reports', label: 'Financial Statements Hub', icon: 'reports' },
      { path: '/reports/income-statement', label: 'Income Statement', icon: 'reports' },
      { path: '/reports/balance-sheet', label: 'Balance Sheet', icon: 'reports' },
      { path: '/reports/cash-flow', label: 'Cash Flow Statement', icon: 'reports' },
      { path: '/reports/customer-aging', label: 'Customer Aging Report', icon: 'customers' },
      { path: '/reports/supplier-aging', label: 'Supplier Aging Report', icon: 'suppliers' },
    ],
  },
  {
    section: 'Compliance',
    icon: 'compliance',
    items: [
      { path: '/compliance/dashboard', label: 'Compliance Dashboard', icon: 'compliance' },
      { path: '/compliance/public-interest-score', label: 'Public Interest Score', icon: 'trialBalance' },
      { path: '/compliance/reporting-standards', label: 'Reporting Standards', icon: 'reports' },
    ],
  },
  {
    section: 'Related Parties',
    icon: 'relatedParties',
    items: [
      { path: '/related-parties/register', label: 'Related Party Register', icon: 'relatedParties' },
      { path: '/related-parties/transactions', label: 'Related Party Transactions', icon: 'payments' },
    ],
  },
  {
    section: 'Leases',
    icon: 'leases',
    items: [
      { path: '/leases/register', label: 'Lease Register', icon: 'leases' },
      { path: '/leases/amortization', label: 'Lease Amortization', icon: 'trendDown' },
    ],
  },
  {
    section: 'Foreign Exchange',
    icon: 'foreignExchange',
    items: [
      { path: '/foreign-exchange/rates', label: 'Exchange Rates', icon: 'foreignExchange' },
      { path: '/foreign-exchange/calculator', label: 'FX Calculator', icon: 'settings' },
    ],
  },
  {
    section: 'Admin',
    icon: 'admin',
    items: [
      { path: '/admin/users', label: 'User & Role Management', icon: 'users' },
      { path: '/admin/audit', label: 'System Audit Trail', icon: 'audit' },
    ],
  },
];
