import {
  ActivityIcon,
  ArrowLeftRightIcon,
  BanknoteIcon,
  BookOpenIcon,
  BoxesIcon,
  CalculatorIcon,
  CircleDollarSignIcon,
  ClockIcon,
  CreditCardIcon,
  FileTextIcon,
  FilesIcon,
  HistoryIcon,
  HourglassIcon,
  LayoutDashboardIcon,
  LinkIcon,
  ListIcon,
  type LucideIcon,
  NetworkIcon,
  PackageCheckIcon,
  PercentIcon,
  ReceiptTextIcon,
  RouteIcon,
  SendIcon,
  ShoppingCartIcon,
  TagIcon,
  TrendingUpIcon,
  TruckIcon,
  WalletCardsIcon,
} from 'lucide-react';

/**
 * One semantic concept → one lucide icon, shared across every module so the
 * same idea always looks the same (a truck is always "in transit", a cart is
 * always "purchasing"). Used by the icon-led `RecordTabs` and the compact
 * `StatTile` tooltips; import `SEMANTIC_ICONS` rather than picking an icon
 * per page.
 */
export const SEMANTIC_ICONS = {
  overview: LayoutDashboardIcon,
  stock: BoxesIcon,
  onHand: BoxesIcon,
  available: PackageCheckIcon,
  committed: TagIcon,
  inTransit: TruckIcon,
  onOrder: ArrowLeftRightIcon,
  stockValue: WalletCardsIcon,
  cost: CircleDollarSignIcon,
  wac: CircleDollarSignIcon,
  margin: PercentIcon,
  purchasing: ShoppingCartIcon,
  receiving: TruckIcon,
  sales: ReceiptTextIcon,
  fulfilment: TruckIcon,
  traceability: NetworkIcon,
  movements: RouteIcon,
  accounting: CalculatorIcon,
  ledger: BookOpenIcon,
  journal: BookOpenIcon,
  documents: FilesIcon,
  attachments: FileTextIcon,
  activity: HistoryIcon,
  relatedRecords: LinkIcon,
  lineItems: ListIcon,
  payments: BanknoteIcon,
  allocations: BanknoteIcon,
  ageing: HourglassIcon,
  transactions: ListIcon,
  statements: FileTextIcon,
  remittance: SendIcon,
  history: ClockIcon,
  card: CreditCardIcon,
  trend: TrendingUpIcon,
  activity_alt: ActivityIcon,
} satisfies Record<string, LucideIcon>;

/** Slug/label fragments → semantic key, longest/most-specific first. */
const KEYWORD_MAP: [RegExp, keyof typeof SEMANTIC_ICONS][] = [
  [/related|linked/i, 'relatedRecords'],
  [/line[\s-]?item|line/i, 'lineItems'],
  [/overview|detail|summary|general/i, 'overview'],
  [/receiv(e|ing)/i, 'receiving'],
  [/purchas|supplier invoice|bill|expense/i, 'purchasing'],
  [/fulfil/i, 'fulfilment'],
  [/deliver|dispatch/i, 'inTransit'],
  [/trace|evidence/i, 'traceability'],
  [/movement/i, 'movements'],
  [/account|posting|gl|ledger/i, 'accounting'],
  [/journal/i, 'journal'],
  [/document|attach/i, 'documents'],
  [/activity|audit|log|changes/i, 'activity'],
  [/allocation/i, 'allocations'],
  [/payment|receipt|remit/i, 'payments'],
  [/statement/i, 'statements'],
  [/age?ing/i, 'ageing'],
  [/transaction|history/i, 'transactions'],
  [/stock|inventory|warehouse/i, 'stock'],
  [/sales|invoice|quote|customer/i, 'sales'],
];

/**
 * Best-guess icon for a record tab that did not pass its own `icon`. Falls
 * back to a neutral list icon so a tab is never icon-less in icon-led mode.
 */
export function resolveTabIcon(value: string, label?: string): LucideIcon {
  const haystack = `${value} ${label ?? ''}`;
  for (const [re, key] of KEYWORD_MAP) {
    if (re.test(haystack)) return SEMANTIC_ICONS[key];
  }
  return ListIcon;
}

/**
 * A generic-but-useful second line for a record tab's tooltip when the tab did
 * not pass its own `hint`. Once the wording is hidden behind an icon, the
 * tooltip has to earn its keep — a bare "Accounting" is less helpful than
 * "Accounts, journals and posting evidence". Count-bearing tabs spell the
 * count out ("12 related records"); obvious tabs (Overview) get nothing.
 */
export function resolveTabHint(value: string, label: string, count?: number): string | undefined {
  const haystack = `${value} ${label}`.toLowerCase();
  const n = count != null && count > 0 ? count : undefined;
  const plural = (one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

  if (/related|linked/.test(haystack)) return n ? plural('related record', 'related records') : 'Linked documents in this chain';
  if (/line[\s-]?item/.test(haystack)) return n ? plural('line', 'lines') : undefined;
  if (/trace|evidence/.test(haystack)) return n ? `${n} stock movements and evidence records` : 'Stock movements and evidence';
  if (/movement/.test(haystack)) return n ? plural('movement', 'movements') : undefined;
  if (/receiv/.test(haystack)) return n ? `${n} goods-receipt movements` : 'Goods received against this order';
  if (/allocation/.test(haystack)) return n ? plural('allocation', 'allocations') : 'How this money was applied';
  if (/payment/.test(haystack)) return n ? plural('payment', 'payments') : 'Payments and adjustments';
  if (/statement|remit/.test(haystack)) return 'Statements and remittance advice';
  if (/age?ing/.test(haystack)) return 'Balance by age bucket';
  if (/transaction|history/.test(haystack)) return 'Invoices, payments and adjustments';
  if (/account|posting|ledger|journal/.test(haystack)) return 'Accounts, journals and posting evidence';
  if (/document|attach/.test(haystack)) return n ? plural('related document', 'related documents') : 'Related business documents';
  if (/activity|audit|log|changes/.test(haystack)) return 'Change history and audit trail';
  if (/fulfil/.test(haystack)) return 'Delivery and invoicing progress';
  if (/supplier invoice|^bill/.test(haystack)) return 'Supplier invoice raised from this order';
  return n ? `${n}` : undefined;
}
