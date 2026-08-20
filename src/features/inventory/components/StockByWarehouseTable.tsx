import { useMemo } from 'react';
import type { Product, Warehouse } from '@/types';
import type { StockLevel } from '../services/stockService';
import { EmptyState } from '@/components/feedback/EmptyState';

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
 * is forbidden; the arithmetic already happened in stockService).
 */
export function StockByWarehouseTable({ products, warehouses, stockLevels }: StockByWarehouseTableProps) {
  const trackedProducts = useMemo(() => products.filter((p) => p.trackInventory), [products]);

  const levelFor = (productId: string, warehouseId: string): number =>
    stockLevels.find((s) => s.productId === productId && s.warehouseId === warehouseId)?.quantityOnHand ?? 0;

  if (trackedProducts.length === 0 || warehouses.length === 0) {
    return <EmptyState title="Nothing to show" message="Add a tracked product and a warehouse to see stock levels." />;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[600px] border-collapse text-left text-sm">
        <thead className="bg-background">
          <tr>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Product</th>
            {warehouses.map((w) => (
              <th key={w.id} className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">
                {w.name}
              </th>
            ))}
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Total</th>
          </tr>
        </thead>
        <tbody>
          {trackedProducts.map((product) => (
            <tr key={product.id} className="border-t border-border hover:bg-background">
              <td className="whitespace-nowrap px-md py-sm text-text-primary">
                {product.name} <span className="text-xs text-text-muted">({product.sku})</span>
              </td>
              {warehouses.map((w) => (
                <td key={w.id} className="whitespace-nowrap px-md py-sm text-text-primary">
                  {levelFor(product.id, w.id)}
                </td>
              ))}
              <td className="whitespace-nowrap px-md py-sm font-medium text-text-primary">
                {product.quantityOnHand}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
