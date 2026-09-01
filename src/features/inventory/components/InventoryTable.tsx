import { useMemo } from 'react';
import type { Product, ProductCategory, StockBalance, Supplier, Warehouse } from '@/types';
import { DataTable, type DataTableColumn, type DataTableFilter } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { StatusBadge } from '@/components/app/status-badge';
import { cn } from '@/lib/utils';
import { buildInventoryRows, type InventoryRow } from '../utils/buildInventoryRows';

interface Props {
  products: Product[];
  balances: StockBalance[];
  categories: ProductCategory[];
  suppliers: Supplier[];
  warehouses: Warehouse[];
  onSelect: (product: Product) => void;
  /** Reports the current search/filter/sort result (Phase 7 export/print infrastructure) — see `DataTable`'s own doc comment. */
  onVisibleRowsChange?: (rows: InventoryRow[], activeFilters: { label: string; value: string }[]) => void;
}

const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3));

export function InventoryTable({ products, balances, categories, suppliers, warehouses, onSelect, onVisibleRowsChange }: Props) {
  const rows = useMemo(
    () => buildInventoryRows(products, balances, categories, suppliers),
    [products, balances, categories, suppliers],
  );

  const warehouseProductIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const b of balances) {
      if (!map.has(b.warehouseId)) map.set(b.warehouseId, new Set());
      map.get(b.warehouseId)!.add(b.productId);
    }
    return map;
  }, [balances]);

  const columns: DataTableColumn<InventoryRow>[] = [
    {
      key: 'sku',
      header: 'SKU',
      cell: (r) => <span className="figure text-xs text-muted-foreground">{r.product.sku}</span>,
      sortValue: (r) => r.product.sku,
    },
    {
      key: 'name',
      header: 'Product',
      cell: (r) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{r.product.name}</span>
          {r.product.type === 'service' && <span className="text-xs text-muted-foreground">Service</span>}
        </div>
      ),
      sortValue: (r) => r.product.name,
    },
    {
      key: 'category',
      header: 'Category',
      cell: (r) => <span className="text-sm text-muted-foreground">{r.categoryName}</span>,
      sortValue: (r) => r.categoryName,
      hideBelowMd: true,
    },
    {
      key: 'supplier',
      header: 'Preferred supplier',
      cell: (r) => <span className="text-sm text-muted-foreground">{r.supplierName}</span>,
      sortValue: (r) => r.supplierName,
      hideBelowMd: true,
    },
    {
      key: 'onHand',
      header: 'On hand',
      align: 'right',
      cell: (r) =>
        r.product.trackInventory ? (
          <span className={cn('figure tabular-nums', r.onHand <= 0 && 'text-negative')}>{qty(r.onHand)}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
      sortValue: (r) => r.onHand,
    },
    {
      key: 'available',
      header: 'Available',
      align: 'right',
      cell: (r) =>
        r.product.trackInventory ? <span className="figure tabular-nums">{qty(r.available)}</span> : <span className="text-xs text-muted-foreground">—</span>,
      sortValue: (r) => r.available,
      hideBelowMd: true,
    },
    {
      key: 'committed',
      header: 'Committed',
      align: 'right',
      cell: (r) => <span className="figure tabular-nums text-muted-foreground">{qty(r.committed)}</span>,
      sortValue: (r) => r.committed,
      hideBelowMd: true,
    },
    {
      key: 'reorder',
      header: 'Reorder',
      align: 'right',
      cell: (r) => (
        <span className="figure tabular-nums text-muted-foreground">
          {r.reorderLevel === undefined ? '—' : qty(r.reorderLevel)}
        </span>
      ),
      sortValue: (r) => r.reorderLevel ?? -1,
      hideBelowMd: true,
    },
    {
      key: 'avgCost',
      header: 'Avg cost',
      align: 'right',
      cell: (r) => <Amount value={r.avgCost} />,
      sortValue: (r) => r.avgCost,
      hideBelowMd: true,
    },
    {
      key: 'value',
      header: 'Inventory value',
      align: 'right',
      cell: (r) => <Amount value={r.inventoryValue} />,
      sortValue: (r) => r.inventoryValue,
    },
    {
      key: 'selling',
      header: 'Selling price',
      align: 'right',
      cell: (r) => <Amount value={r.sellingPrice} />,
      sortValue: (r) => r.sellingPrice,
      hideBelowMd: true,
    },
    {
      key: 'margin',
      header: 'Margin',
      align: 'right',
      cell: (r) =>
        r.marginPercent === null ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <span className={cn('figure tabular-nums', r.marginPercent < 0 && 'text-negative')}>
            {r.marginPercent.toFixed(1)}%
          </span>
        ),
      sortValue: (r) => r.marginPercent ?? -999,
      hideBelowMd: true,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={r.product.status} />
          {r.stockState === 'low' && <span className="text-xs text-warning">Low</span>}
          {r.stockState === 'out' && <span className="text-xs text-negative">Out</span>}
        </div>
      ),
      sortValue: (r) => r.product.status,
    },
  ];

  const filters: DataTableFilter<InventoryRow>[] = [
    {
      key: 'category',
      label: 'All categories',
      options: [
        ...categories.map((c) => ({ value: c.id, label: c.name })),
        { value: '__none', label: 'Uncategorised' },
      ],
      match: (r, value) =>
        value === '__none' ? !r.product.categoryId : r.product.categoryId === value,
    },
    {
      key: 'supplier',
      label: 'All suppliers',
      options: suppliers.map((s) => ({ value: s.id, label: s.name })),
      match: (r, value) => r.product.preferredSupplierId === value,
    },
    {
      key: 'stock',
      label: 'Any stock level',
      options: [
        { value: 'in_stock', label: 'In stock' },
        { value: 'low', label: 'Low stock' },
        { value: 'out', label: 'Out of stock' },
        { value: 'untracked', label: 'Not tracked' },
      ],
      match: (r, value) => r.stockState === value,
    },
    ...(warehouses.length > 1
      ? [
          {
            key: 'warehouse',
            label: 'All warehouses',
            options: warehouses.map((w) => ({ value: w.id, label: w.name })),
            match: (r: InventoryRow, value: string) =>
              warehouseProductIds.get(value)?.has(r.product.id) ?? false,
          } satisfies DataTableFilter<InventoryRow>,
        ]
      : []),
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowKey={(r) => r.product.id}
      searchable={(r) => `${r.product.sku} ${r.product.name} ${r.categoryName} ${r.supplierName}`}
      searchPlaceholder="Search SKU or name"
      filters={filters}
      initialSortKey="name"
      pageSize={15}
      emptyTitle="No products"
      emptyDescription="Add your first item to start tracking stock, or adjust the filters above."
      onRowClick={(r) => onSelect(r.product)}
      getRowAriaLabel={(r) => `Open ${r.product.name}`}
      caption={`${products.length} item${products.length === 1 ? '' : 's'}`}
      onVisibleRowsChange={onVisibleRowsChange}
    />
  );
}
