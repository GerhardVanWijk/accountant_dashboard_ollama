import type { LucideIcon } from 'lucide-react';
import {
  ArchiveIcon,
  ArrowLeftRightIcon,
  BanknoteIcon,
  BookOpenIcon,
  BuildingIcon,
  CalendarRangeIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  CreditCardIcon,
  FileBarChartIcon,
  FileSignatureIcon,
  FileTextIcon,
  FolderOpenIcon,
  GaugeIcon,
  HandCoinsIcon,
  HelpCircleIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  LibraryIcon,
  ListTreeIcon,
  PackageIcon,
  PercentIcon,
  ReceiptIcon,
  ScaleIcon,
  ScrollTextIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  SquareStackIcon,
  TrendingUpIcon,
  TruckIcon,
  UsersIcon,
  UserCogIcon,
  WalletIcon,
  BellIcon,
  UsersRoundIcon,
  Building2Icon,
  KeyRoundIcon,
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
}

export interface NavGroup {
  title: string;
  items: NavItem[];
  /** Groups start collapsed unless they hold the active route. */
  defaultOpen?: boolean;
}

/**
 * Ported from accounting-v0-frontend/lib/app/navigation.ts. Labels, icons
 * and grouping match v0 exactly (fidelity priority); hrefs point at this
 * app's REAL existing routes (src/app/router.tsx) rather than v0's own
 * flat /app/* paths, per the agreed "keep this app's route paths, v0's
 * nav moves onto them" approach. See docs/V0_DESIGN_SYSTEM_PORT.md for the
 * full mapping and which items are comingSoon pending their module's port.
 */
export const navGroups: NavGroup[] = [
  {
    title: 'Overview',
    defaultOpen: true,
    items: [{ title: 'Dashboard', href: '/', icon: LayoutDashboardIcon }],
  },
  {
    title: 'Organisation',
    items: [
      { title: 'Companies', href: '/companies', icon: BuildingIcon },
      { title: 'Clients', href: '/clients', icon: UsersIcon, comingSoon: true },
      { title: 'Customers', href: '/sales/customers', icon: HandCoinsIcon },
      { title: 'Suppliers', href: '/purchases/vendors', icon: TruckIcon },
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
    ],
  },
  {
    title: 'Sales',
    items: [
      { title: 'Quotes', href: '/sales/quotes', icon: FileSignatureIcon },
      { title: 'Sales Orders', href: '/sales/orders', icon: ClipboardListIcon },
      { title: 'Invoices', href: '/sales/invoices', icon: FileTextIcon },
      { title: 'Credit Notes', href: '/sales/credit-notes', icon: ReceiptIcon },
      { title: 'Payments', href: '/sales/receipts', icon: BanknoteIcon },
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
    title: 'Expenses',
    items: [
      { title: 'Bills & Expenses', href: '/purchases/bills', icon: CreditCardIcon },
    ],
  },
  {
    title: 'Tax & Compliance',
    items: [
      { title: 'VAT', href: '/tax/vat-return', icon: PercentIcon },
      { title: 'Tax', href: '/tax/income-tax', icon: ClipboardCheckIcon },
      { title: 'Compliance', href: '/compliance/dashboard', icon: ShieldCheckIcon },
    ],
  },
  {
    title: 'Assets & Inventory',
    items: [
      { title: 'Assets', href: '/assets/register', icon: SquareStackIcon },
      { title: 'Inventory', href: '/inventory/products', icon: PackageIcon },
    ],
  },
  {
    title: 'Reports',
    items: [
      { title: 'Report Library', href: '/reports', icon: LibraryIcon },
      { title: 'Income Statement', href: '/reports/income-statement', icon: TrendingUpIcon },
      { title: 'Balance Sheet', href: '/reports/balance-sheet', icon: GaugeIcon },
      { title: 'Cash Flow', href: '/reports/cash-flow', icon: FileBarChartIcon },
      { title: 'Accounts Receivable Aging', href: '/reports/customer-aging', icon: UsersRoundIcon },
      { title: 'Accounts Payable Aging', href: '/reports/supplier-aging', icon: Building2Icon },
    ],
  },
  {
    title: 'Administration',
    items: [
      { title: 'Audit Trail', href: '/admin/audit-trail', icon: ArchiveIcon },
      { title: 'Access Log', href: '/admin/audit', icon: KeyRoundIcon },
      { title: 'Documents', href: '/documents', icon: FolderOpenIcon, comingSoon: true },
      { title: 'Notifications', href: '/notifications', icon: BellIcon, comingSoon: true },
      { title: 'User Management', href: '/admin/users', icon: UserCogIcon },
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
  companies: 'Companies',
  clients: 'Clients',
  sales: 'Sales',
  customers: 'Customers',
  purchases: 'Purchases',
  vendors: 'Suppliers',
  accounting: 'Accounting',
  coa: 'Chart of Accounts',
  ledger: 'General Ledger',
  journals: 'Journal Entries',
  'trial-balance': 'Trial Balance',
  'financial-periods': 'Financial Periods',
  invoices: 'Invoices',
  'credit-notes': 'Credit Notes',
  receipts: 'Customer Receipts',
  banking: 'Banking',
  accounts: 'Bank Accounts',
  transactions: 'Bank Transactions',
  reconciliation: 'Bank Reconciliation',
  bills: 'Bills & Expenses',
  tax: 'Tax',
  'vat-return': 'VAT',
  compliance: 'Compliance',
  dashboard: 'Compliance Dashboard',
  assets: 'Assets',
  register: 'Register',
  inventory: 'Inventory',
  products: 'Inventory',
  reports: 'Reports',
  'income-statement': 'Income Statement',
  'balance-sheet': 'Balance Sheet',
  'cash-flow': 'Cash Flow',
  'customer-aging': 'Accounts Receivable Aging',
  'supplier-aging': 'Accounts Payable Aging',
  admin: 'Administration',
  audit: 'Access Log',
  'audit-trail': 'Audit Trail',
  documents: 'Documents',
  notifications: 'Notifications',
  users: 'User Management',
  settings: 'Settings',
  help: 'Help Centre',
};

/** Section a route belongs to, used as the middle breadcrumb crumb. */
export function sectionForPath(pathname: string): string | null {
  for (const group of navGroups) {
    if (group.title === 'Overview') continue;
    const match = group.items.some(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    );
    if (match) return group.title;
  }
  return null;
}
