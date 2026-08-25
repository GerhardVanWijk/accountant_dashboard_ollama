import type { Warehouse } from '@/types';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { StatusBadge } from '@/components/app/status-badge';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';

export interface WarehousesTableProps {
  warehouses: Warehouse[];
  /** Omit either (M11: gated by inventory:update / inventory:delete) to hide that row action. */
  onEdit?: (warehouse: Warehouse) => void;
  onDelete?: (warehouse: Warehouse) => void;
}

/** Warehouse directory, re-skinned onto v0's DataTable (M8) — no literal v0 template exists for multi-warehouse stock. */
export function WarehousesTable({ warehouses, onEdit, onDelete }: WarehousesTableProps) {
  const columns: DataTableColumn<Warehouse>[] = [
    {
      key: 'name',
      header: 'Warehouse',
      sortValue: (w) => w.name,
      cell: (w) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{w.name}</span>
          <span className="text-xs text-muted-foreground">{w.code}</span>
        </div>
      ),
    },
    {
      key: 'location',
      header: 'Location',
      hideBelowMd: true,
      sortValue: (w) => w.address?.city ?? '',
      cell: (w) => <span className="text-xs text-muted-foreground">{w.address?.city ?? '—'}</span>,
    },
    {
      key: 'default',
      header: 'Default',
      cell: (w) => (w.isDefault ? <Badge>Default</Badge> : <span className="text-xs text-muted-foreground">—</span>),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (w) => w.status,
      cell: (w) => <StatusBadge status={w.status} />,
    },
    {
      key: 'actions',
      header: '',
      cell: (w) =>
        onEdit || onDelete ? (
          <div className="flex justify-end gap-1">
            {onEdit && (
              <Button variant="ghost" size="sm" onClick={() => onEdit(w)}>
                Edit
              </Button>
            )}
            {onDelete && (
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(w)}>
                Delete
              </Button>
            )}
          </div>
        ) : null,
    },
  ];

  return (
    <DataTable
      rows={warehouses}
      columns={columns}
      getRowKey={(w) => w.id}
      searchable={(w) => [w.name, w.code, w.address?.city ?? ''].join(' ')}
      searchPlaceholder="Search by name, code or city"
      initialSortKey="name"
      emptyTitle="No warehouses yet"
      emptyDescription="Add a warehouse to start allocating stock."
    />
  );
}
