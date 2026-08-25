import { useMemo } from 'react';
import type { Product, Warehouse } from '@/types';
import type { StockLevel } from '../services/stockService';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/shadcn/empty';

export interface StockByWarehouseTableProps {
  products: Product[];
  warehouses: Warehouse[];
  stockLevels: StockLevel[];
}

/**
 * Quantity-on-hand per product per warehouse, derived entirely from the
 * stock movement ledger via stockService.getStockLevels() (passed in as
 * `stockLevels`) — this component does no stock math itself
 * (docs/DO_NOT_BREAK.md § Inventory & Stock: "Make stock UI calculations"
 * is forbidden; the arithmetic already happened in stockService). No
 * literal v0 template exists for this cross-tab view — re-skinned onto
 * v0's general table/Empty language (M8).
 */
export function StockByWarehouseTable({ products, warehouses, stockLevels }: StockByWarehouseTableProps) {
  const trackedProducts = useMemo(() => products.filter((p) => p.trackInventory), [products]);

  const levelFor = (productId: string, warehouseId: string): number =>
    stockLevels.find((s) => s.productId === productId && s.warehouseId === warehouseId)?.quantityOnHand ?? 0;

  if (trackedProducts.length === 0 || warehouses.length === 0) {
    return (
      <Empty>
        <EmptyTitle>Nothing to show</EmptyTitle>
        <EmptyDescription>Add a tracked product and a warehouse to see stock levels.</EmptyDescription>
      </Empty>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[600px] border-collapse text-left text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground">Product</th>
            {warehouses.map((w) => (
              <th key={w.id} className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">
                {w.name}
              </th>
            ))}
            <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Total</th>
          </tr>
        </thead>
        <tbody>
          {trackedProducts.map((product) => (
            <tr key={product.id} className="border-t border-border">
              <td className="whitespace-nowrap px-4 py-2.5">
                {product.name} <span className="text-xs text-muted-foreground">({product.sku})</span>
              </td>
              {warehouses.map((w) => (
                <td key={w.id} className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                  {levelFor(product.id, w.id)}
                </td>
              ))}
              <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums">{product.quantityOnHand}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
