import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/app/format';
import type { WarehouseAggregate } from '../utils/warehouseAggregates';

/**
 * Per-warehouse control rollup — on hand / committed / available, in-transit
 * in and out, stock value and the low / negative stock item counts, all
 * derived read-side from the balance cache + transfer headers (no engine
 * re-implementation).
 */
export function WarehouseSummaryTable({ rows }: { rows: WarehouseAggregate[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No warehouses yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <th className="px-3 py-2.5 text-left">Warehouse</th>
            <th className="px-3 py-2.5 text-right">Lines</th>
            <th className="px-3 py-2.5 text-right">On hand</th>
            <th className="px-3 py-2.5 text-right">Committed</th>
            <th className="px-3 py-2.5 text-right">Available</th>
            <th className="px-3 py-2.5 text-right">In transit in</th>
            <th className="px-3 py-2.5 text-right">In transit out</th>
            <th className="px-3 py-2.5 text-right">Stock value</th>
            <th className="px-3 py-2.5 text-right">Alerts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ warehouse, ...a }, i) => (
            <tr key={warehouse.id} className={cn('border-b border-border last:border-0', i % 2 === 1 && 'bg-muted/20')}>
              <td className="px-3 py-2">
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">{warehouse.name}</span>
                  <span className="figure text-xs text-muted-foreground">
                    {warehouse.code}
                    {warehouse.isDefault ? ' · default' : ''}
                  </span>
                </div>
              </td>
              <td className="figure px-3 py-2 text-right tabular-nums text-muted-foreground">{a.productLines}</td>
              <td className={cn('figure px-3 py-2 text-right tabular-nums', a.onHand < 0 && 'text-status-negative')}>{a.onHand}</td>
              <td className="figure px-3 py-2 text-right tabular-nums text-muted-foreground">{a.committed}</td>
              <td className={cn('figure px-3 py-2 text-right tabular-nums', a.available < 0 && 'text-status-negative')}>{a.available}</td>
              <td className="figure px-3 py-2 text-right tabular-nums text-muted-foreground">{a.inTransitIn || '—'}</td>
              <td className="figure px-3 py-2 text-right tabular-nums text-muted-foreground">{a.inTransitOut || '—'}</td>
              <td className="figure px-3 py-2 text-right tabular-nums">{formatCurrency(a.stockValue)}</td>
              <td className="px-3 py-2 text-right">
                <span className="inline-flex flex-wrap justify-end gap-1">
                  {a.negativeStockItems > 0 && (
                    <span className="rounded border border-status-negative-outline bg-status-negative-surface/50 px-1.5 py-0.5 text-[0.7rem] font-medium text-status-negative">
                      {a.negativeStockItems} negative
                    </span>
                  )}
                  {a.lowStockItems > 0 && (
                    <span className="rounded border border-status-warning-outline bg-status-warning-surface/50 px-1.5 py-0.5 text-[0.7rem] font-medium text-status-warning">
                      {a.lowStockItems} low
                    </span>
                  )}
                  {a.negativeStockItems === 0 && a.lowStockItems === 0 && (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
