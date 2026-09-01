import { Link } from 'react-router-dom';
import { ArrowLeftRightIcon, ClipboardCheckIcon, Loader2, PackagePlusIcon, ScaleIcon, Undo2Icon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { useStockAdjustments } from '../hooks/useStockAdjustments';
import { useStockTransfers } from '../hooks/useStockTransfers';
import { useStockTakes } from '../hooks/useStockTakes';
import { useSupplierReturns } from '../hooks/useSupplierReturns';
import { useOpeningStockBatches } from '../hooks/useOpeningStockBatches';

interface OperationCard {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  pendingCount: number;
  pendingLabel: string;
}

/**
 * Stock Operations hub — route `/inventory/operations` (Phase 5 §6). One
 * landing page for the five accounting-significant inventory workflows
 * (adjustment / transfer / take / supplier return / opening stock), each
 * a draft-then-post document lifecycle over its own service — this page
 * links to each register and surfaces how many documents are sitting in
 * a pre-posted state, never mutates anything itself.
 */
export function InventoryOperationsPage() {
  const { adjustments, loading: adjustmentsLoading } = useStockAdjustments();
  const { transfers, loading: transfersLoading } = useStockTransfers();
  const { stockTakes, loading: stockTakesLoading } = useStockTakes();
  const { supplierReturns, loading: supplierReturnsLoading } = useSupplierReturns();
  const { batches, loading: batchesLoading } = useOpeningStockBatches();

  const busy = adjustmentsLoading || transfersLoading || stockTakesLoading || supplierReturnsLoading || batchesLoading;

  const cards: OperationCard[] = [
    {
      title: 'Stock adjustments',
      description: 'Write-offs, shrinkage, damage, stock gains and corrections.',
      href: '/inventory/adjustments',
      icon: ScaleIcon,
      pendingCount: adjustments.filter((a) => a.status === 'draft' || a.status === 'pending_approval').length,
      pendingLabel: 'awaiting action',
    },
    {
      title: 'Stock transfers',
      description: 'Move stock between warehouses, with or without an in-transit trail.',
      href: '/inventory/transfers',
      icon: ArrowLeftRightIcon,
      pendingCount: transfers.filter((t) => t.status === 'draft' || t.status === 'in_transit').length,
      pendingLabel: 'in progress',
    },
    {
      title: 'Stock takes',
      description: 'Physical counts — freeze a scope, count against it, post the net variance.',
      href: '/inventory/stock-takes',
      icon: ClipboardCheckIcon,
      pendingCount: stockTakes.filter((s) => s.status !== 'posted' && s.status !== 'cancelled').length,
      pendingLabel: 'in progress',
    },
    {
      title: 'Supplier returns',
      description: 'Return goods to a supplier — stock leaves at carrying cost, the gap posts to Purchase Price Variance.',
      href: '/inventory/supplier-returns',
      icon: Undo2Icon,
      pendingCount: supplierReturns.filter((r) => r.status === 'draft').length,
      pendingLabel: 'drafts',
    },
    {
      title: 'Opening stock',
      description: 'Capture opening inventory balances — requires explicit confirmation before it posts.',
      href: '/inventory/opening-stock',
      icon: PackagePlusIcon,
      pendingCount: batches.filter((b) => b.status === 'draft').length,
      pendingLabel: 'drafts',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Stock operations"
        description="Every accounting-significant inventory workflow, reviewed and posted through its own draft-then-post lifecycle — never a direct quantity edit."
      />

      {busy && (
        <div role="status" className="flex min-h-[30vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading stock operations…</p>
        </div>
      )}

      {!busy && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <Link key={card.href} to={card.href} className="block no-underline">
              <SectionCard className="h-full transition-colors hover:border-primary/40">
                <div className="flex items-start gap-3">
                  <card.icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold text-foreground">{card.title}</span>
                    <span className="text-xs text-muted-foreground">{card.description}</span>
                    {card.pendingCount > 0 && (
                      <span className="mt-1 text-xs font-medium text-status-warning">
                        {card.pendingCount} {card.pendingLabel}
                      </span>
                    )}
                  </div>
                </div>
              </SectionCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
