import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useStockAlerts } from '../hooks/useStockAlerts';

export interface LowStockAlertWidgetProps {
  /** Caps how many rows render per section before "+N more" — keeps the widget compact on a dashboard. Default 5. */
  maxItemsPerSection?: number;
}

/**
 * Self-contained low-stock / out-of-stock alert widget. Takes no required
 * props — drop it into any page (dashboard-bee: the Executive Dashboard)
 * and it fetches its own data via useStockAlerts -> stockService, so no
 * modification is needed at the call site. See
 * src/features/inventory/services/stockService.ts's getLowStockItems()/
 * getOutOfStockItems() for the underlying (also directly importable)
 * service functions.
 */
export function LowStockAlertWidget({ maxItemsPerSection = 5 }: LowStockAlertWidgetProps) {
  const { lowStock, outOfStock, loading, error, refetch } = useStockAlerts();

  return (
    <Card>
      <div className="mb-md flex items-center justify-between gap-md">
        <h3 className="flex items-center gap-sm text-base font-semibold text-text-primary">
          <Icon name="warehouses" size={18} className="text-warning" />
          Stock Alerts
        </h3>
      </div>

      {loading && <Spinner label="Checking stock levels…" />}
      {!loading && error && <ErrorState message={error.message} onRetry={refetch} />}
      {!loading && !error && lowStock.length === 0 && outOfStock.length === 0 && (
        <EmptyState title="All stocked up" message="No items are low or out of stock right now." />
      )}

      {!loading && !error && (lowStock.length > 0 || outOfStock.length > 0) && (
        <div className="flex flex-col gap-md">
          {outOfStock.length > 0 && (
            <div>
              <p className="mb-xs text-sm font-medium text-danger">Out of stock ({outOfStock.length})</p>
              <ul className="flex flex-col gap-xs">
                {outOfStock.slice(0, maxItemsPerSection).map((product) => (
                  <li key={product.id} className="flex items-center justify-between text-sm text-text-primary">
                    <span>{product.name}</span>
                    <span className="text-xs text-text-secondary">{product.sku}</span>
                  </li>
                ))}
              </ul>
              {outOfStock.length > maxItemsPerSection && (
                <p className="mt-xs text-xs text-text-muted">+{outOfStock.length - maxItemsPerSection} more</p>
              )}
            </div>
          )}

          {lowStock.length > 0 && (
            <div>
              <p className="mb-xs text-sm font-medium text-warning">Low stock ({lowStock.length})</p>
              <ul className="flex flex-col gap-xs">
                {lowStock.slice(0, maxItemsPerSection).map((product) => (
                  <li key={product.id} className="flex items-center justify-between text-sm text-text-primary">
                    <span>{product.name}</span>
                    <span className="text-xs text-text-secondary">
                      {product.quantityOnHand} / {product.reorderLevel} on hand
                    </span>
                  </li>
                ))}
              </ul>
              {lowStock.length > maxItemsPerSection && (
                <p className="mt-xs text-xs text-text-muted">+{lowStock.length - maxItemsPerSection} more</p>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
