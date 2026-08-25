import type { Product } from '@/types';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
import { getTaxRateLabel } from '../constants';
import { useAllTaxRates } from '@/features/tax/hooks/useTaxRates';

export interface ProductsTableProps {
  products: Product[];
  /** Omit either (M11: gated by inventory:update / inventory:delete) to hide that row action. */
  onEdit?: (product: Product) => void;
  onDelete?: (product: Product) => void;
}

type StockFlag = 'out' | 'low' | 'ok' | 'n/a';

function stockFlagFor(product: Product): StockFlag {
  if (!product.trackInventory) return 'n/a';
  if (product.quantityOnHand <= 0) return 'out';
  if (product.reorderLevel !== undefined && product.quantityOnHand <= product.reorderLevel) return 'low';
  return 'ok';
}

const flagBadgeClasses: Record<StockFlag, string> = {
  out: 'bg-negative/15 text-negative',
  low: 'bg-warning/15 text-warning',
  ok: 'bg-positive/15 text-positive',
  'n/a': 'bg-muted text-muted-foreground',
};

const flagLabels: Record<StockFlag, string> = {
  out: 'Out of stock',
  low: 'Low stock',
  ok: 'In stock',
  'n/a': 'Not tracked',
};

/**
 * Searchable / filterable / sortable product directory, re-skinned onto
 * v0's DataTable (M8) — mirrors accounting-v0-frontend's InventoryTable
 * shape. Stock-level math (stockFlagFor) mirrors
 * stockService.getLowStockItems/getOutOfStockItems' thresholds but reads
 * from already-loaded product data for per-row display — the authoritative
 * low/out-of-stock lists themselves come from stockService (see
 * LowStockAlertWidget.tsx), not from this table. Product.status
 * (active/inactive) and the stock flag are two separate real axes, kept
 * separate here — v0's own mock collapsed them into one status field,
 * which the real Product type does not.
 */
export function ProductsTable({ products, onEdit, onDelete }: ProductsTableProps) {
  const { taxRates } = useAllTaxRates();
  const categories = [...new Set(products.map((p) => p.category).filter((c): c is string => Boolean(c)))].sort();

  const columns: DataTableColumn<Product>[] = [
    {
      key: 'sku',
      header: 'Item',
      sortValue: (p) => p.sku,
      cell: (p) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{p.name}</span>
          <span className="figure text-xs text-muted-foreground tabular-nums">{p.sku}</span>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      hideBelowMd: true,
      sortValue: (p) => p.type,
      cell: (p) => <span className="text-xs">{p.type === 'good' ? 'Good' : 'Service'}</span>,
    },
    {
      key: 'category',
      header: 'Category',
      hideBelowMd: true,
      sortValue: (p) => p.category ?? '',
      cell: (p) => <span className="text-xs text-muted-foreground">{p.category ?? '—'}</span>,
    },
    {
      key: 'costPrice',
      header: 'Unit cost',
      align: 'right',
      hideBelowMd: true,
      sortValue: (p) => p.costPrice,
      cell: (p) => <Amount value={p.costPrice} plain className="text-sm text-muted-foreground" />,
    },
    {
      key: 'unitPrice',
      header: 'Sell price',
      align: 'right',
      hideBelowMd: true,
      sortValue: (p) => p.unitPrice,
      cell: (p) => <Amount value={p.unitPrice} plain className="text-sm text-muted-foreground" />,
    },
    {
      key: 'taxRate',
      header: 'Tax rate',
      hideBelowMd: true,
      sortValue: (p) => getTaxRateLabel(p.taxRateId, taxRates),
      cell: (p) => <span className="text-xs text-muted-foreground">{getTaxRateLabel(p.taxRateId, taxRates)}</span>,
    },
    {
      key: 'quantity',
      header: 'On hand',
      align: 'right',
      sortValue: (p) => p.quantityOnHand,
      cell: (p) => (p.trackInventory ? <span className="figure text-sm tabular-nums">{p.quantityOnHand}</span> : <span className="text-xs text-muted-foreground">—</span>),
    },
    {
      key: 'stock',
      header: 'Stock',
      sortValue: (p) => stockFlagFor(p),
      cell: (p) => {
        const flag = stockFlagFor(p);
        return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', flagBadgeClasses[flag])}>{flagLabels[flag]}</span>;
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (p) => p.status,
      cell: (p) => <StatusBadge status={p.status} />,
    },
    {
      key: 'actions',
      header: '',
      cell: (p) =>
        onEdit || onDelete ? (
          <div className="flex justify-end gap-1">
            {onEdit && (
              <Button variant="ghost" size="sm" onClick={() => onEdit(p)}>
                Edit
              </Button>
            )}
            {onDelete && (
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(p)}>
                Delete
              </Button>
            )}
          </div>
        ) : null,
    },
  ];

  return (
    <DataTable
      rows={products}
      columns={columns}
      getRowKey={(p) => p.id}
      searchable={(p) => [p.sku, p.name, p.category ?? ''].join(' ')}
      searchPlaceholder="Search by SKU or name"
      initialSortKey="sku"
      filters={[
        {
          key: 'type',
          label: 'All types',
          options: [
            { value: 'good', label: 'Goods' },
            { value: 'service', label: 'Services' },
          ],
          match: (p, value) => p.type === value,
        },
        {
          key: 'category',
          label: 'All categories',
          options: categories.map((c) => ({ value: c, label: c })),
          match: (p, value) => p.category === value,
        },
        {
          key: 'status',
          label: 'All statuses',
          options: [
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ],
          match: (p, value) => p.status === value,
        },
      ]}
      emptyTitle="No products yet"
      emptyDescription="Add your first product or service to start tracking stock."
    />
  );
}
