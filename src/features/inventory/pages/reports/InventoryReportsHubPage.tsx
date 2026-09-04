import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangleIcon,
  ArrowLeftRightIcon,
  Building2Icon,
  ClipboardCheckIcon,
  ListTreeIcon,
  PackageXIcon,
  ScaleIcon,
  ScanBarcodeIcon,
  ShieldCheckIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  WalletIcon,
  WarehouseIcon,
} from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';

interface ReportCard {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

interface ReportGroup {
  title: string;
  cards: ReportCard[];
}

const REPORT_GROUPS: ReportGroup[] = [
  {
    title: 'Stock',
    cards: [
      { title: 'Stock on hand', description: 'Current on-hand, available and committed quantity by product and warehouse.', href: '/inventory/reports/stock-on-hand', icon: ScanBarcodeIcon },
      { title: 'Inventory valuation', description: 'Inventory value at WAC, reconciled to the Inventory Asset and In-Transit control accounts.', href: '/inventory/reports/valuation', icon: WalletIcon },
      { title: 'Low stock', description: 'Items at or below their reorder level, with a suggested order quantity.', href: '/inventory/reports/low-stock', icon: TrendingDownIcon },
      { title: 'Out of stock', description: 'Items at zero or negative on-hand quantity, with product status and last movement.', href: '/inventory/reports/out-of-stock', icon: PackageXIcon },
    ],
  },
  {
    title: 'Movement',
    cards: [
      { title: 'Stock movement', description: 'The append-only ledger for a chosen period, with increases, decreases and net value.', href: '/inventory/reports/movements', icon: ArrowLeftRightIcon },
      { title: 'Stock adjustments', description: 'Posted write-offs, shrinkage, damage and gains for a chosen period, by reason.', href: '/inventory/reports/adjustments', icon: ScaleIcon },
      { title: 'Transfers', description: 'Inter-warehouse transfers for a chosen period, with status and in-transit duration.', href: '/inventory/reports/transfers', icon: ArrowLeftRightIcon },
    ],
  },
  {
    title: 'Control',
    cards: [
      { title: 'Inventory reconciliation', description: 'Full subledger-to-GL reconciliation — every check, every finding, in detail.', href: '/inventory/reports/inventory-reconciliation', icon: ShieldCheckIcon },
      { title: 'Goods delivered not invoiced', description: 'Posted Delivery Notes not yet fully invoiced, valued at frozen cost — reconciled to GL 1220.', href: '/inventory/reports/goods-delivered-not-invoiced', icon: ShieldCheckIcon },
      { title: 'Stock take variance', description: 'Counted variance across every stock take, valued at the frozen WAC.', href: '/inventory/reports/stock-take-variance', icon: ClipboardCheckIcon },
    ],
  },
  {
    title: 'Analysis',
    cards: [
      { title: 'Category analysis', description: 'Inventory position by category — stock and value (no sales/margin — see limitations).', href: '/inventory/reports/category-analysis', icon: ListTreeIcon },
      { title: 'Warehouse analysis', description: 'Inventory position by warehouse — items, units, value, low/out-of-stock counts.', href: '/inventory/reports/warehouse-analysis', icon: WarehouseIcon },
      { title: 'Supplier analysis', description: 'Inventory position by preferred supplier — items, value, replenishment need.', href: '/inventory/reports/supplier-analysis', icon: Building2Icon },
      { title: 'Margin analysis', description: 'Current theoretical margin per product — today\'s price vs today\'s WAC.', href: '/inventory/reports/margin-analysis', icon: TrendingUpIcon },
      { title: 'Slow-moving / dead stock', description: 'Stock still on hand, bucketed by days since its last economic movement.', href: '/inventory/reports/slow-moving', icon: AlertTriangleIcon },
    ],
  },
];

/**
 * Inventory Reports hub — route `/inventory/reports` (Phase 8 spec §2). One
 * landing page grouping every report this phase actually built, honestly —
 * see docs/INVENTORY_REPORTS.md for the full data-availability audit behind
 * this list, including which reports were deliberately NOT built (report
 * analytics that would require fabricating a relationship this schema
 * doesn't have) and why.
 */
export function InventoryReportsHubPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Inventory reports"
        description="Stock, movement, control and analysis reports built on the same authoritative data and valuation contract as the rest of Inventory — nothing here is independently recalculated."
      />

      {REPORT_GROUPS.map((group) => (
        <div key={group.title} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{group.title}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.cards.map((card) => (
              <Link key={card.href} to={card.href} className="block no-underline">
                <SectionCard className="h-full transition-colors hover:border-primary/40">
                  <div className="flex items-start gap-3">
                    <card.icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-semibold text-foreground">{card.title}</span>
                      <span className="text-xs text-muted-foreground">{card.description}</span>
                    </div>
                  </div>
                </SectionCard>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
