import { AlertTriangle, Loader2 } from 'lucide-react';
import { SectionCard } from '@/components/app/page-header';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/shadcn/empty';
import { Button } from '@/components/ui/shadcn/button';
import { useStockAlerts } from '../hooks/useStockAlerts';

export interface LowStockAlertWidgetProps {
  /** Caps how many rows render per section before "+N more" — keeps the widget compact on a dashboard. Default 5. */
  maxItemsPerSection?: number;
}

/**
 * Self-contained low-stock / out-of-stock alert widget. Takes no required
 * props — drop it into any page (e.g. the Executive Dashboard) and it
 * fetches its own data via useStockAlerts -> stockService, so no
 * modification is needed at the call site. See
 * src/features/inventory/services/stockService.ts's getLowStockItems()/
 * getOutOfStockItems() for the underlying (also directly importable)
 * service functions. Re-skinned onto v0's SectionCard/Empty (M8); no
 * literal v0 template exists for this widget.
 */
export function LowStockAlertWidget({ maxItemsPerSection = 5 }: LowStockAlertWidgetProps) {
  const { lowStock, outOfStock, loading, error, refetch } = useStockAlerts();

  return (
    <SectionCard title="Stock alerts" description="Items below their reorder level or already out of stock.">
      {loading && (
        <div role="status" className="flex min-h-[10vh] items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          <span className="text-sm">Checking stock levels…</span>
        </div>
      )}
      {!loading && error && (
        <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{error.message}</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}
      {!loading && !error && lowStock.length === 0 && outOfStock.length === 0 && (
        <Empty>
          <EmptyTitle>All stocked up</EmptyTitle>
          <EmptyDescription>No items are low or out of stock right now.</EmptyDescription>
        </Empty>
      )}

      {!loading && !error && (lowStock.length > 0 || outOfStock.length > 0) && (
        <div className="flex flex-col gap-4">
          {outOfStock.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-destructive">
                <AlertTriangle className="size-3.5" aria-hidden="true" />
                Out of stock ({outOfStock.length})
              </p>
              <ul className="flex flex-col gap-1">
                {outOfStock.slice(0, maxItemsPerSection).map((product) => (
                  <li key={product.id} className="flex items-center justify-between text-sm">
                    <span>{product.name}</span>
                    <span className="text-xs text-muted-foreground">{product.sku}</span>
                  </li>
                ))}
              </ul>
              {outOfStock.length > maxItemsPerSection && <p className="mt-1 text-xs text-muted-foreground">+{outOfStock.length - maxItemsPerSection} more</p>}
            </div>
          )}

          {lowStock.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-warning">
                <AlertTriangle className="size-3.5" aria-hidden="true" />
                Low stock ({lowStock.length})
              </p>
              <ul className="flex flex-col gap-1">
                {lowStock.slice(0, maxItemsPerSection).map((product) => (
                  <li key={product.id} className="flex items-center justify-between text-sm">
                    <span>{product.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {product.quantityOnHand} / {product.reorderLevel} on hand
                    </span>
                  </li>
                ))}
              </ul>
              {lowStock.length > maxItemsPerSection && <p className="mt-1 text-xs text-muted-foreground">+{lowStock.length - maxItemsPerSection} more</p>}
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
