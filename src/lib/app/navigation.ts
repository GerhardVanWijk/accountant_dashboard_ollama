import type { LucideIcon } from 'lucide-react';
import {
  ArchiveIcon,
  ArrowLeftRightIcon,
  BanknoteIcon,
  BookOpenIcon,
  BoxesIcon,
  BuildingIcon,
  Building2Icon,
  CalculatorIcon,
  CalendarClockIcon,
  CalendarRangeIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  CoinsIcon,
  CreditCardIcon,
  FileBarChartIcon,
  FileSignatureIcon,
  FileTextIcon,
  FolderOpenIcon,
  GaugeIcon,
  HandCoinsIcon,
  HelpCircleIcon,
  HourglassIcon,
  KeyRoundIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  LibraryIcon,
  LineChartIcon,
  ListTreeIcon,
  PackageCheckIcon,
  PackageIcon,
  PackageXIcon,
  PercentIcon,
  ReceiptIcon,
  ScaleIcon,
  ScrollTextIcon,
  SettingsIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  SquareStackIcon,
  Trash2Icon,
  TrendingDownIcon,
  TrendingUpIcon,
  TruckIcon,
  UserCogIcon,
  UsersIcon,
  UsersRoundIcon,
  WalletIcon,
  WarehouseIcon,
  BellIcon,
} from 'lucide-react';

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Shown as a count/status pill on the sidebar item. */
  badge?: string;
  badgeTone?: 'brand' | 'warning' | 'negative';
  /**
   * True when this v0 nav item has no live route in this app yet (Phase M0
   * ports the shell only, not module pages). Kept in the nav for visual
   * fidelity with v0 rather than silently dropped; href points at a path
   * with no route match, which the existing catch-all NotFoundPage handles
   * honestly. Remove this flag as each module is actually ported (M1+).
   */
  comingSoon?: boolean;
  /**
   * A convenience shortcut that duplicates an item owned by a dedicated
   * operational group elsewhere (e.g. Organisation → Inventory, whose real
   * home is the Inventory group). Clicking it navigates normally, but it is
   * excluded from active-state / group-expansion computation so it never
   * steals the "active section" from the operational group while the user
   * is inside that module's subpages. It only highlights on its own exact
   * route. See AppSidebar's accordion logic + navigation.sectionForPath.
   */
  quickAccess?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/**
 * Ported from accounting-v0-frontend/lib/app/navigation.ts, restructured in
 * the navigation-UX pass (see AppSidebar's accordion logic) once every real
 * route in src/app/router.tsx was inspected directly rather than assumed:
 * roughly two dozen real, already-built pages (Purchase Orders, Supplier
 * Payments, Vendor Aging, Tax Rates, Provisional/Capital Gains/Dividends/
 * Deferred Tax, Expected Credit Losses, Reporting Standards, Public
 * Interest Score, Related Parties, Foreign Exchange, Leases, Warehouses,
 * Depreciation, Disposals, Asset Tax Register, and the entire Payroll
 * module) had no nav entry at all and were unreachable except by typing
 * the URL directly. Every href below is a real router.tsx path — none
 * invented. "Clients" (no real backend domain — see CompanyPage.tsx's own
 * doc comment on the single-tenant model) has been removed rather than
 * kept as a comingSoon placeholder, since there is no module planned to
 * ever fill it, unlike Documents/Notifications below which stay
 * comingSoon pending a real future module.
 */
export const navGroups: NavGroup[] = [
  {
    title: 'Overview',
    items: [{ title: 'Dashboard', href: '/', icon: LayoutDashboardIcon }],
  },
  {
    title: 'Organisation',
    items: [
      { title: 'Company', href: '/companies', icon: BuildingIcon },
      { title: 'Customers', href: '/sales/customers', icon: HandCoinsIcon },
      { title: 'Suppliers', href: '/purchases/vendors', icon: TruckIcon },
      { title: 'Inventory', href: '/inventory', icon: BoxesIcon, quickAccess: true },
    ],
  },
  {
    title: 'Sales',
    items: [
      { title: 'Quotes', href: '/sales/quotes', icon: FileSignatureIcon },
      { title: 'Sales Orders', href: '/sales/orders', icon: ClipboardListIcon },
      { title: 'Delivery Notes', href: '/sales/delivery-notes', icon: PackageCheckIcon },
      { title: 'Return Notes', href: '/sales/return-notes', icon: PackageXIcon },
      { title: 'Invoices', href: '/sales/invoices', icon: FileTextIcon },
      { title: 'Credit Notes', href: '/sales/credit-notes', icon: ReceiptIcon },
      { title: 'Customer Receipts', href: '/sales/receipts', icon: BanknoteIcon },
    ],
  },
  {
    title: 'Purchases & Expenses',
    items: [
      { title: 'Bills & Expenses', href: '/purchases/bills', icon: CreditCardIcon },
      { title: 'Purchase Orders', href: '/purchases/orders', icon: ClipboardCheckIcon },
      { title: 'Supplier Payments', href: '/purchases/payments', icon: BanknoteIcon },
      { title: 'Vendor Aging', href: '/purchases/aging', icon: CalendarClockIcon },
    ],
  },
  {
    title: 'Inventory',
    items: [
      { title: 'Overview', href: '/inventory', icon: BoxesIcon },
      { title: 'Products', href: '/inventory/products', icon: PackageIcon },
      { title: 'Categories', href: '/inventory/categories', icon: ListTreeIcon },
      { title: 'Warehouses', href: '/inventory/warehouses', icon: WarehouseIcon },
      { title: 'Stock Movements', href: '/inventory/movements', icon: ArrowLeftRightIcon },
      { title: 'Operations', href: '/inventory/operations', icon: ClipboardCheckIcon },
      { title: 'Reports', href: '/inventory/reports', icon: FileBarChartIcon },
    ],
  },
  {
    title: 'Accounting',
    items: [
      { title: 'Chart of Accounts', href: '/accounting/coa', icon: ListTreeIcon },
      { title: 'General Ledger', href: '/accounting/ledger', icon: BookOpenIcon },
      { title: 'Journal Entries', href: '/accounting/journals', icon: ScrollTextIcon },
      { title: 'Trial Balance', href: '/accounting/trial-balance', icon: ScaleIcon },
      { title: 'Financial Periods', href: '/financial-periods', icon: CalendarRangeIcon },
      { title: 'Exchange Rates', href: '/foreign-exchange/rates', icon: CoinsIcon },
      { title: 'FX Calculator', href: '/foreign-exchange/calculator', icon: CalculatorIcon },
    ],
  },
  {
    title: 'Banking',
    items: [
      { title: 'Bank Accounts', href: '/banking/accounts', icon: LandmarkIcon },
      { title: 'Bank Transactions', href: '/banking/transactions', icon: WalletIcon },
      { title: 'Bank Reconciliation', href: '/banking/reconciliation', icon: ArrowLeftRightIcon },
    ],
  },
  {
    title: 'Tax & Compliance',
    items: [
      { title: 'VAT', href: '/tax/vat-return', icon: PercentIcon },
      { title: 'Tax Rates', href: '/tax/rates', icon: SlidersHorizontalIcon },
      { title: 'Income Tax', href: '/tax/income-tax', icon: ClipboardCheckIcon },
      { title: 'Provisional Tax', href: '/tax/provisional-tax', icon: CalendarClockIcon },
      { title: 'Capital Gains', href: '/tax/capital-gains', icon: TrendingUpIcon },
      { title: 'Dividends Tax', href: '/tax/dividends', icon: HandCoinsIcon },
      { title: 'Deferred Tax', href: '/tax/deferred-tax', icon: HourglassIcon },
      { title: 'Expected Credit Losses', href: '/tax/expected-credit-losses', icon: ShieldAlertIcon },
      { title: 'Compliance', href: '/compliance/dashboard', icon: ShieldCheckIcon },
      { title: 'Reporting Standards', href: '/compliance/reporting-standards', icon: LibraryIcon },
      { title: 'Public Interest Score', href: '/compliance/public-interest-score', icon: GaugeIcon },
      { title: 'Related Party Register', href: '/related-parties/register', icon: UsersRoundIcon },
      { title: 'Related Party Transactions', href: '/related-parties/transactions', icon: ArrowLeftRightIcon },
    ],
  },
  {
    title: 'Fixed Assets',
    items: [
      { title: 'Fixed Assets', href: '/assets/register', icon: SquareStackIcon },
      { title: 'Depreciation', href: '/assets/depreciation', icon: TrendingDownIcon },
      { title: 'Disposals', href: '/assets/disposals', icon: Trash2Icon },
      { title: 'Asset Tax Register', href: '/assets/tax-register', icon: FileTextIcon },
    ],
  },
  {
    title: 'Leases',
    items: [
      { title: 'Lease Register', href: '/leases/register', icon: FileSignatureIcon },
      { title: 'Lease Amortization', href: '/leases/amortization', icon: CalendarClockIcon },
    ],
  },
  {
    title: 'Payroll',
    items: [
      { title: 'Employees', href: '/payroll/employees', icon: UsersIcon },
      { title: 'Payroll Runs', href: '/payroll/runs', icon: CalendarClockIcon },
      { title: 'EMP201', href: '/payroll/emp201', icon: FileTextIcon },
      { title: 'EMP501', href: '/payroll/emp501', icon: ClipboardCheckIcon },
    ],
  },
  {
    title: 'Reports',
    items: [
      { title: 'Reports Centre', href: '/reports', icon: LibraryIcon },
      { title: 'Income Statement', href: '/reports/income-statement', icon: TrendingUpIcon },
      { title: 'Balance Sheet', href: '/reports/balance-sheet', icon: GaugeIcon },
      { title: 'Cash Flow', href: '/reports/cash-flow', icon: FileBarChartIcon },
      { title: 'Customer Aging', href: '/reports/customer-aging', icon: UsersRoundIcon },
      { title: 'Supplier Aging', href: '/reports/supplier-aging', icon: Building2Icon },
      { title: 'Forecasting', href: '/reports/forecasting', icon: LineChartIcon },
    ],
  },
  {
    title: 'Administration',
    items: [
      { title: 'Users & Roles', href: '/admin/users', icon: UserCogIcon },
      { title: 'Audit Trail', href: '/admin/audit-trail', icon: ArchiveIcon },
      { title: 'Access Log', href: '/admin/audit', icon: KeyRoundIcon },
      { title: 'Documents', href: '/documents', icon: FolderOpenIcon, comingSoon: true },
      { title: 'Notifications', href: '/notifications', icon: BellIcon, comingSoon: true },
      { title: 'Settings', href: '/settings', icon: SettingsIcon },
      { title: 'Accounting Settings', href: '/settings/accounting', icon: SlidersHorizontalIcon },
    ],
  },
  {
    title: 'Help',
    items: [{ title: 'Help Centre', href: '/help', icon: HelpCircleIcon }],
  },
];

/** Human-readable label for a route segment, used to build breadcrumbs. */
export const segmentLabels: Record<string, string> = {
  companies: 'Company',
  sales: 'Sales',
  customers: 'Customers',
  purchases: 'Purchases',
  vendors: 'Suppliers',
  payments: 'Supplier Payments',
  accounting: 'Accounting',
  coa: 'Chart of Accounts',
  ledger: 'General Ledger',
  journals: 'Journal Entries',
  'trial-balance': 'Trial Balance',
  'financial-periods': 'Financial Periods',
  invoices: 'Invoices',
  'credit-notes': 'Credit Notes',
  'delivery-notes': 'Delivery Notes',
  deliver: 'Create delivery',
  'return-notes': 'Return Notes',
  return: 'Create return',
  receipts: 'Customer Receipts',
  banking: 'Banking',
  accounts: 'Bank Accounts',
  reconciliation: 'Bank Reconciliation',
  bills: 'Bills & Expenses',
  tax: 'Tax',
  'vat-return': 'VAT',
  compliance: 'Compliance',
  dashboard: 'Compliance Dashboard',
  assets: 'Fixed Assets',
  register: 'Register',
  inventory: 'Inventory',
  products: 'Products',
  categories: 'Categories',
  warehouses: 'Warehouses',
  movements: 'Stock Movements',
  operations: 'Operations',
  adjustments: 'Stock Adjustments',
  transfers: 'Stock Transfers',
  'stock-takes': 'Stock Takes',
  'supplier-returns': 'Supplier Returns',
  'opening-stock': 'Opening Stock',
  reports: 'Reports',
  'stock-on-hand': 'Stock on Hand',
  valuation: 'Inventory Valuation',
  'low-stock': 'Low Stock',
  'out-of-stock': 'Out of Stock',
  'stock-take-variance': 'Stock Take Variance',
  'inventory-reconciliation': 'Inventory Reconciliation',
  'category-analysis': 'Category Analysis',
  'warehouse-analysis': 'Warehouse Analysis',
  'supplier-analysis': 'Supplier Analysis',
  'margin-analysis': 'Margin Analysis',
  'slow-moving': 'Slow-Moving / Dead Stock',
  'income-statement': 'Income Statement',
  'balance-sheet': 'Balance Sheet',
  'cash-flow': 'Cash Flow',
  'customer-aging': 'Customer Aging',
  'supplier-aging': 'Supplier Aging',
  forecasting: 'Forecasting',
  admin: 'Administration',
  audit: 'Access Log',
  'audit-trail': 'Audit Trail',
  documents: 'Documents',
  notifications: 'Notifications',
  users: 'Users & Roles',
  settings: 'Settings',
  help: 'Help Centre',
  payroll: 'Payroll',
  runs: 'Payroll Runs',
  emp201: 'EMP201',
  emp501: 'EMP501',
  employees: 'Employees',
  'related-parties': 'Related Parties',
  'foreign-exchange': 'Foreign Exchange',
  leases: 'Leases',
};

/**
 * True when a nav item's route matches the current path. `/` only matches
 * exactly; a `quickAccess` shortcut matches only its own exact route (it
 * never claims the module's subpages — those belong to the dedicated
 * operational group); every other item matches its route or any nested path.
 */
export function isNavItemActive(
  pathname: string,
  item: Pick<NavItem, 'href' | 'quickAccess'>,
): boolean {
  if (item.href === '/') return pathname === '/';
  if (item.quickAccess) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** True when the group contains the active route (quick-access items excluded). */
export function groupHoldsActive(group: NavGroup, pathname: string): boolean {
  return group.items.some((item) => !item.quickAccess && isNavItemActive(pathname, item));
}

/** Multi-item groups are the collapsible accordion sections; single-item groups render flat. */
export function isAccordionGroup(group: NavGroup): boolean {
  return group.items.length > 1;
}

/**
 * Which accordion section the sidebar should keep expanded for a route.
 * `quickAccess` items never count, and when two sections both match, the one
 * with the most specific match (longest matched href) wins — so an
 * operational group beats a broad parent, and navigating between a module's
 * pages keeps that module's section open.
 */
export function activeAccordionGroupTitle(groups: NavGroup[], pathname: string): string | null {
  let best: { title: string; length: number } | null = null;
  for (const group of groups) {
    if (!isAccordionGroup(group)) continue;
    for (const item of group.items) {
      if (item.quickAccess || !isNavItemActive(pathname, item)) continue;
      if (!best || item.href.length > best.length) {
        best = { title: group.title, length: item.href.length };
      }
    }
  }
  return best?.title ?? null;
}

/**
 * Section a route belongs to, used as the middle breadcrumb crumb.
 *
 * `quickAccess` items are skipped: Organisation → Inventory would otherwise
 * claim every `/inventory/*` route as living under "Organisation", when its
 * real section is the dedicated "Inventory" group. A more specific match
 * (longer `href`) always wins over a shorter prefix match so a nested
 * operational group is preferred over a broad parent.
 */
export function sectionForPath(pathname: string): string | null {
  let best: { title: string; length: number } | null = null;
  for (const group of navGroups) {
    if (group.title === 'Overview') continue;
    for (const item of group.items) {
      if (item.quickAccess) continue;
      const matches = pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (matches && (!best || item.href.length > best.length)) {
        best = { title: group.title, length: item.href.length };
      }
    }
  }
  return best?.title ?? null;
}
