import { useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import type { Product } from '@/types';
import { Icon } from '@/components/ui/Icon';
import { formatCurrency } from '@/utils/formatCurrency';
import { getTaxRateLabel, INVENTORY_CURRENCY } from '../constants';

export interface ProductsTableProps {
  products: Product[];
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
}

type StockFlag = 'out' | 'low' | 'ok' | 'n/a';

function stockFlagFor(product: Product): StockFlag {
  if (!product.trackInventory) return 'n/a';
  if (product.quantityOnHand <= 0) return 'out';
  if (product.reorderLevel !== undefined && product.quantityOnHand <= product.reorderLevel) return 'low';
  return 'ok';
}

const flagBadgeClasses: Record<StockFlag, string> = {
  out: 'bg-danger text-on-accent',
  low: 'bg-warning text-on-accent',
  ok: 'bg-success text-on-accent',
  'n/a': 'bg-background text-text-muted',
};

const flagLabels: Record<StockFlag, string> = {
  out: 'Out of stock',
  low: 'Low stock',
  ok: 'In stock',
  'n/a': 'Not tracked',
};

/**
 * Searchable / filterable / sortable product directory table (TanStack
 * Table). Stock-level math (stockFlagFor) mirrors
 * stockService.getLowStockItems/getOutOfStockItems' thresholds but reads
 * from already-loaded product data for per-row display — the authoritative
 * low/out-of-stock lists themselves come from stockService (see
 * LowStockAlertWidget.tsx), not from this table.
 */
export function ProductsTable({ products, onEdit, onDelete }: ProductsTableProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | Product['type']>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | Product['status']>('all');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter((c): c is string => Boolean(c)))).sort(),
    [products],
  );
  const [categoryFilter, setCategoryFilter] = useState<'all' | string>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (typeFilter !== 'all' && p.type !== typeFilter) return false;
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      if (q && !p.sku.toLowerCase().includes(q) && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, search, typeFilter, statusFilter, categoryFilter]);

  const columns = useMemo<ColumnDef<Product>[]>(
    () => [
      { accessorKey: 'sku', header: 'SKU' },
      { accessorKey: 'name', header: 'Name' },
      {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ getValue }) => (getValue<Product['type']>() === 'good' ? 'Good' : 'Service'),
      },
      { accessorKey: 'uom', header: 'UOM', cell: ({ getValue }) => getValue<string | undefined>() ?? '—' },
      {
        accessorKey: 'costPrice',
        header: 'Cost Price',
        cell: ({ getValue }) => formatCurrency(getValue<number>(), INVENTORY_CURRENCY),
      },
      {
        accessorKey: 'unitPrice',
        header: 'Sell Price',
        cell: ({ getValue }) => formatCurrency(getValue<number>(), INVENTORY_CURRENCY),
      },
      {
        accessorKey: 'taxRateId',
        header: 'Tax Rate',
        cell: ({ getValue }) => getTaxRateLabel(getValue<string | undefined>()),
      },
      {
        accessorKey: 'quantityOnHand',
        header: 'Qty on Hand',
        cell: ({ row }) => (row.original.trackInventory ? row.original.quantityOnHand : '—'),
      },
      {
        id: 'stockFlag',
        header: 'Stock',
        cell: ({ row }) => {
          const flag = stockFlagFor(row.original);
          return (
            <span className={`inline-flex items-center rounded-full px-sm py-0.5 text-xs font-medium ${flagBadgeClasses[flag]}`}>
              {flagLabels[flag]}
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex justify-end gap-sm">
            <button
              type="button"
              onClick={() => onEdit(row.original)}
              className="rounded-md px-sm py-xs text-xs font-medium text-primary hover:underline"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onDelete(row.original)}
              className="rounded-md px-sm py-xs text-xs font-medium text-danger hover:underline"
            >
              Delete
            </button>
          </div>
        ),
      },
    ],
    [onEdit, onDelete],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-xs">
          <Icon
            name="search"
            size={16}
            className="pointer-events-none absolute left-sm top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by SKU or name…"
            aria-label="Search products"
            className="w-full rounded-md border border-border bg-panel py-xs pl-2xl pr-sm text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          />
        </div>
        <div className="flex flex-wrap gap-sm">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | Product['type'])}
            aria-label="Filter by type"
            className="rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary"
          >
            <option value="all">All types</option>
            <option value="good">Goods</option>
            <option value="service">Services</option>
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
            className="rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | Product['status'])}
            aria-label="Filter by status"
            className="rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead className="bg-background">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        disabled={!header.column.getCanSort()}
                        className="inline-flex items-center gap-xs disabled:cursor-default"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{ asc: ' ▲', desc: ' ▼' }[header.column.getIsSorted() as string] ?? ''}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t border-border hover:bg-background">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="whitespace-nowrap px-md py-sm text-text-primary">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
