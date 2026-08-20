import {
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
  BookOpen,
  BookText,
  Boxes,
  Calendar,
  ChevronDown,
  CircleUserRound,
  Download,
  Eye,
  FileText,
  Filter,
  History,
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
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sun,
  Trash2,
  Truck,
  UserCog,
  Users,
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
  bills: Receipt,
  products: Package,
  warehouses: Warehouse,
  banking: Landmark,
  accounting: BookOpen,
  journals: BookText,
  ledger: ListOrdered,
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
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof Icons;
