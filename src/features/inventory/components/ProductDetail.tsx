import type { Product, StockMovement, TaxRate, Warehouse } from '@/types';
import { SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDateTime } from '@/lib/app/format';
import { getTaxRateLabel } from '../constants';

export interface ProductDetailProps {
  product: Product;
  movements: StockMovement[];
  warehousesById: Map<string, Warehouse>;
  taxRates: TaxRate[];
}

const MOVEMENT_TYPE_LABELS: Record<StockMovement['type'], string> = {
  goods_received: 'Goods received',
  sale: 'Sale',
  sales_return: 'Sales return',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
  adjustment: 'Adjustment',
  opening: 'Opening stock',
  purchase_return: 'Purchase return',
  write_off: 'Write-off',
  stock_gain: 'Stock gain',
  stock_take: 'Stock take',
  correction: 'Correction',
};

/** New — ProductsTable never had a detail view before this pass, only inline Edit/Delete row actions. */
export function ProductDetail({ product, movements, warehousesById, taxRates }: ProductDetailProps) {
  return (
    <>
      <SectionCard title={product.name} description={product.category ?? undefined}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <FigureBlock label="Unit cost" value={formatCurrency(product.costPrice)} />
          <FigureBlock label="Sell price" value={formatCurrency(product.unitPrice)} />
          <FigureBlock label="Tax rate" value={getTaxRateLabel(product.taxRateId, taxRates)} />
          {product.trackInventory && (
            <>
              <FigureBlock label="On hand" value={String(product.quantityOnHand)} />
              {product.reorderLevel !== undefined && <FigureBlock label="Reorder level" value={String(product.reorderLevel)} />}
            </>
          )}
        </div>
        {product.description && <p className="mt-4 text-sm text-muted-foreground">{product.description}</p>}
      </SectionCard>

      {product.trackInventory && movements.length > 0 && (
        <SectionCard title="Stock movement history" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">Type</th>
                  <th className="px-4 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">Warehouse</th>
                  <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Qty</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(m.createdAt)}</td>
                    <td className="px-4 py-2">
                      {MOVEMENT_TYPE_LABELS[m.type]}
                      {m.reference && <span className="ml-1 text-xs text-muted-foreground">({m.reference})</span>}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{warehousesById.get(m.warehouseId)?.name ?? m.warehouseId}</td>
                    <td className={cn('figure px-4 py-2 text-right text-sm tabular-nums', m.quantityDelta < 0 && 'text-negative')}>
                      {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </>
  );
}
