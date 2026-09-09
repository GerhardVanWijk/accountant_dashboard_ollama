import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangleIcon,
  ActivityIcon,
  BoxesIcon,
  CheckCircle2Icon,
  FileWarningIcon,
  Loader2,
  PackageCheckIcon,
  PackagePlusIcon,
  PackageXIcon,
  ScaleIcon,
  ShieldAlertIcon,
  TrendingDownIcon,
  TruckIcon,
  WalletIcon,
} from 'lucide-react';
import type { Product, StockMovement, StockTransfer } from '@/types';
import { isOpaqueReference } from '@/components/app/record-page';
import { SectionCard } from '@/components/app/page-header';
import { StatStrip, StatTile } from '@/components/app/stat-tile';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/app/format';
import { calculateInventoryTotals } from '../utils/calculateInventoryTotals';
import { totalOnOrder } from '../services/stockOnOrderService';
import type { InventoryReconciliationResult } from '../services/reconcileInventory';

/** A `StatTile` wrapped in a drill-down link. */
function LinkedTile({ to, ...tile }: { to: string } & React.ComponentProps<typeof StatTile>) {
  return (
    <Link to={to} className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-brand/40 [&>div]:h-full [&>div]:transition-colors [&:hover>div]:bg-accent/40">
      <StatTile {...tile} />
    </Link>
  );
}

/** A movement with no structured source link and no usable free-text reference. */
function missingEvidence(m: StockMovement): boolean {
  if (m.sourceDocumentType && m.sourceDocumentId) return false;
  return isOpaqueReference(m.reference);
}

/**
 * Company-level inventory control panel for the Inventory overview — the
 * drill-in point from company → product → movement → source → accounting
 * evidence. Reads `reconcileInventory()`'s result (via
 * `useInventoryReconciliation()`, passed in) plus the loaded products /
 * movements / transfers. It reproduces NO reconciliation math and never
 * fabricates a count — an unavailable check shows as such.
 */
export function InventoryControlCentre({
  products,
  movements,
  transfers,
  onOrder,
  lowStockCount,
  outOfStockCount,
  result,
  loading,
  error,
}: {
  products: Product[];
  movements: StockMovement[];
  transfers: StockTransfer[];
  /** Derived quantity-on-order map (keyed by commitmentKey). */
  onOrder?: Map<string, number>;
  lowStockCount?: number;
  outOfStockCount?: number;
  result: InventoryReconciliationResult | null;
  loading: boolean;
  error: Error | null;
}) {
  const stats = useMemo(() => {
    const tracked = products.filter((p) => p.trackInventory);
    const totals = calculateInventoryTotals(products);
    const itemsInStock = tracked.filter((p) => p.quantityOnHand > 0).length;
    const activityCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const activity30d = movements.filter(
      (m) => new Date(m.movementDate ?? m.createdAt).getTime() >= activityCutoff,
    ).length;
    const findings = result?.findings ?? [];
    const errorFindings = findings.filter((f) => f.severity === 'error');
    const negativeStock = new Set(
      findings.filter((f) => f.code === 'negative_stock' && f.productId).map((f) => f.productId as string),
    ).size;
    const glExceptions = errorFindings.filter((f) =>
      ['subledger_vs_gl', 'in_transit_vs_gl', 'total_inventory_vs_gl', 'orphan_in_transit', 'duplicate_transfer_receipt'].includes(
        f.code,
      ),
    ).length;
    const unreconciledProducts = new Set(
      errorFindings.filter((f) => f.productId).map((f) => f.productId as string),
    ).size;
    const inTransitCount = transfers.filter((t) => t.status === 'in_transit').length;
    const missingEvidenceCount = movements.filter(missingEvidence).length;

    return {
      trackedCount: tracked.length,
      itemsInStock,
      activity30d,
      inventoryValue: result ? result.subledgerValuation : totals.stockValueAtCost,
      onOrderQty: onOrder ? totalOnOrder(onOrder) : 0,
      negativeStock,
      inTransitCount,
      unreconciledProducts,
      glExceptions,
      missingEvidenceCount,
      totalErrorFindings: errorFindings.length,
      isReconciled: result?.isReconciled ?? null,
    };
  }, [products, movements, transfers, onOrder, result]);

  return (
    <SectionCard
      title="Inventory control"
      description="Company-level stock integrity — drill from here into the product, its movements and their accounting evidence."
      bodyClassName="p-4 sm:p-5"
    >
      <div className="flex flex-col gap-4">
        <StatStrip columns={4}>
          <LinkedTile to="/inventory/products" icon={BoxesIcon} label="Products tracked" value={String(stats.trackedCount)} hint={`${stats.itemsInStock} with stock on hand`} />
          <LinkedTile to="/inventory/reports/valuation" icon={WalletIcon} label="Inventory value" value={formatCurrency(stats.inventoryValue)} hint="Subledger, at WAC" />
          <LinkedTile to="/inventory/movements" icon={ActivityIcon} label="Activity (30 days)" value={String(stats.activity30d)} hint="Stock movements recorded" />
          <LinkedTile to="/inventory/reports/low-stock" icon={PackageCheckIcon} label="Low stock" value={String(lowStockCount ?? 0)} hint="At or below reorder level" tone={(lowStockCount ?? 0) > 0 ? 'warning' : 'default'} />
          <LinkedTile to="/inventory/reports/out-of-stock" icon={PackageXIcon} label="Out of stock" value={String(outOfStockCount ?? 0)} hint="Nothing on hand" tone={(outOfStockCount ?? 0) > 0 ? 'negative' : 'default'} />
          <LinkedTile to="/inventory/transfers" icon={TruckIcon} label="Transfers in transit" value={String(stats.inTransitCount)} hint="Dispatched, not received" tone={stats.inTransitCount > 0 ? 'info' : 'default'} />
          <LinkedTile to="/purchases/orders" icon={PackagePlusIcon} label="On order" value={String(stats.onOrderQty)} hint="Inbound on open purchase orders" tone={stats.onOrderQty > 0 ? 'info' : 'default'} />
          <LinkedTile to="/inventory/reports/inventory-reconciliation" icon={TrendingDownIcon} label="Negative stock" value={loading ? '…' : String(stats.negativeStock)} tone={stats.negativeStock > 0 ? 'negative' : 'default'} />
          <LinkedTile to="/inventory/reports/inventory-reconciliation" icon={ShieldAlertIcon} label="Unreconciled products" value={loading ? '…' : String(stats.unreconciledProducts)} hint="With an error finding" tone={stats.unreconciledProducts > 0 ? 'negative' : 'default'} />
          <LinkedTile to="/inventory/reports/inventory-reconciliation" icon={ScaleIcon} label="Inventory / GL exceptions" value={loading ? '…' : String(stats.glExceptions)} tone={stats.glExceptions > 0 ? 'negative' : 'default'} />
          <LinkedTile to="/inventory/reports/inventory-reconciliation" icon={FileWarningIcon} label="Movements missing evidence" value={String(stats.missingEvidenceCount)} hint="No source-document link" tone={stats.missingEvidenceCount > 0 ? 'warning' : 'default'} />
        </StatStrip>

        <div
          className={cn(
            'flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium',
            error
              ? 'border-status-negative-outline bg-status-negative-surface/40 text-status-negative'
              : loading
                ? 'border-border bg-muted/40 text-muted-foreground'
                : stats.isReconciled
                  ? 'border-status-positive-outline bg-status-positive-surface/40 text-status-positive'
                  : 'border-status-negative-outline bg-status-negative-surface/50 text-status-negative',
          )}
        >
          {error ? (
            <>
              <AlertTriangleIcon className="size-4 shrink-0" aria-hidden="true" />
              Stock integrity check unavailable: {error.message}
            </>
          ) : loading ? (
            <>
              <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
              Checking company stock integrity…
            </>
          ) : stats.isReconciled ? (
            <>
              <CheckCircle2Icon className="size-4 shrink-0" aria-hidden="true" />
              Inventory reconciled — subledger, movement ledger and GL control accounts agree
            </>
          ) : (
            <>
              <ShieldAlertIcon className="size-4 shrink-0" aria-hidden="true" />
              {stats.totalErrorFindings} finding{stats.totalErrorFindings === 1 ? '' : 's'} require investigation
            </>
          )}
          <Link
            to="/inventory/reports/inventory-reconciliation"
            className="ml-auto text-xs font-medium text-brand hover:underline"
          >
            Open reconciliation report →
          </Link>
        </div>
      </div>
    </SectionCard>
  );
}
