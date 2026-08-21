import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpDown,
  BarChart3,
  BookOpen,
  BookText,
  Boxes,
  Calendar,
  CheckCheck,
  ChevronDown,
  CircleUserRound,
  ClipboardCheck,
  ClipboardList,
  Download,
  Eye,
  FileMinus,
  FileQuestion,
  FileText,
  Filter,
  HandCoins,
  History,
  Hourglass,
  Inbox,
  Landmark,
  LayoutDashboard,
  ListOrdered,
  Loader2,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Package,
  Pencil,
  Percent,
  Phone,
  Plus,
  Receipt,
  Scale,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sun,
  Trash2,
  TrendingDown,
  TrendingUp,
  Truck,
  UserCog,
  Users,
  Wallet,
  Warehouse,
  X,
  type LucideIcon,
} from 'lucide-react';

/**
 * Single source of truth for icons — docs/DESIGN_SYSTEM.md § Icon System.
 *
 * One concept maps to exactly one Lucide component. Per docs/DO_NOT_BREAK.md
 * "Icons": no feature/page/component file may import from `lucide-react`
 * directly — only this file and the `<Icon />` wrapper
 * (src/components/ui/Icon.tsx) may. Reuse an existing key for a concept
 * that already has one; only add a new key for a genuinely new concept.
 */
export const Icons = {
  // Domain / nav concepts (one per top-level tab or child route)
  dashboard: LayoutDashboard,
  sales: ShoppingCart,
  purchases: ShoppingBag,
  inventory: Boxes,
  customers: Users,
  suppliers: Truck,
  invoices: FileText,
  quotes: FileQuestion,
  salesOrders: ClipboardList,
  creditNotes: FileMinus,
  customerReceipts: HandCoins,
  bills: Receipt,
  purchaseOrders: ClipboardCheck,
  payments: Wallet,
  vendorAging: Hourglass,
  products: Package,
  warehouses: Warehouse,
  banking: Landmark,
  accounting: BookOpen,
  journals: BookText,
  ledger: ListOrdered,
  trialBalance: Scale,
  bankTransactions: ArrowLeftRight,
  reconciliation: CheckCheck,
  tax: Percent,
  reports: BarChart3,
  admin: ShieldCheck,
  users: UserCog,
  audit: History,
  settings: Settings,

  // The signed-in user (distinct from `users`, the User & Role Management
  // admin concept) — used for the top-bar account menu trigger.
  account: CircleUserRound,

  // Chrome / interaction concepts
  search: Search,
  logout: LogOut,
  menu: Menu,
  close: X,
  chevronDown: ChevronDown,

  // Theme toggle — three distinct states, three distinct icons.
  themeLight: Sun,
  themeDark: Moon,
  themeSystem: Monitor,

  // Feedback states
  empty: Inbox,
  error: AlertTriangle,
  loading: Loader2,

  // Row / table action concepts (used across data tables and forms)
  edit: Pencil,
  add: Plus,
  delete: Trash2,
  filter: Filter,
  download: Download,
  view: Eye,
  sort: ArrowUpDown,
  calendar: Calendar,
  phone: Phone,

  // Trend indicators (dashboard KPI cards — period-over-period % change)
  trendUp: TrendingUp,
  trendDown: TrendingDown,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof Icons;
