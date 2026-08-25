import type { FixedAsset } from '@/types';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { StatusBadge } from '@/components/app/status-badge';
import { formatDate } from '@/lib/app/format';
import { Button } from '@/components/ui/shadcn/button';
import { CATEGORY_LABELS } from '../constants';

export interface AssetsTableProps {
  assets: FixedAsset[];
  onEdit: (asset: FixedAsset) => void;
  onPostAcquisition: (asset: FixedAsset) => void;
  onDelete: (asset: FixedAsset) => void;
}

/** Fixed asset register, re-skinned onto v0's DataTable (M8) — mirrors accounting-v0-frontend's AssetsTable shape, real statuses/categories only. */
export function AssetsTable({ assets, onEdit, onPostAcquisition, onDelete }: AssetsTableProps) {
  const categories = [...new Set(assets.map((a) => a.category))].sort();

  const columns: DataTableColumn<FixedAsset>[] = [
    {
      key: 'number',
      header: 'Asset',
      sortValue: (a) => a.assetNumber,
      cell: (a) => (
        <div className="flex flex-col">
          <span className="font-mono text-sm font-medium text-foreground">{a.assetNumber}</span>
          <span className="text-xs text-muted-foreground">{a.name}</span>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      hideBelowMd: true,
      sortValue: (a) => a.category,
      cell: (a) => <span className="text-xs">{CATEGORY_LABELS[a.category]}</span>,
    },
    {
      key: 'acquired',
      header: 'Acquired',
      hideBelowMd: true,
      sortValue: (a) => a.acquisitionDate,
      cell: (a) => (
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">{formatDate(a.acquisitionDate)}</span>
          <span className="text-xs text-muted-foreground">{a.usefulLifeYears} year life</span>
        </div>
      ),
    },
    {
      key: 'cost',
      header: 'Cost',
      align: 'right',
      hideBelowMd: true,
      sortValue: (a) => a.cost,
      cell: (a) => <Amount value={a.cost} plain className="text-sm text-muted-foreground" />,
    },
    {
      key: 'depreciation',
      header: 'Accum. depreciation',
      align: 'right',
      hideBelowMd: true,
      sortValue: (a) => a.accumulatedDepreciation,
      cell: (a) => <Amount value={-a.accumulatedDepreciation} plain className="text-sm text-muted-foreground" />,
    },
    {
      key: 'carrying',
      header: 'Carrying value',
      align: 'right',
      sortValue: (a) => a.cost - a.accumulatedDepreciation,
      cell: (a) => <Amount value={a.cost - a.accumulatedDepreciation} className="text-sm font-medium" />,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (a) => a.status,
      cell: (a) => <StatusBadge status={a.status} />,
    },
    {
      key: 'actions',
      header: '',
      cell: (a) => (
        <div className="flex justify-end gap-1">
          {a.status === 'draft' && (
            <Button variant="ghost" size="sm" onClick={() => onPostAcquisition(a)}>
              Post acquisition
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => onEdit(a)}>
            Edit
          </Button>
          {a.status === 'draft' && (
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(a)}>
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      rows={assets}
      columns={columns}
      getRowKey={(a) => a.id}
      searchable={(a) => [a.assetNumber, a.name, a.description ?? '', CATEGORY_LABELS[a.category]].join(' ')}
      searchPlaceholder="Search by number, name or category"
      initialSortKey="number"
      filters={[
        {
          key: 'category',
          label: 'All categories',
          options: categories.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
          match: (a, value) => a.category === value,
        },
        {
          key: 'status',
          label: 'All statuses',
          options: [
            { value: 'draft', label: 'Draft' },
            { value: 'active', label: 'Active' },
            { value: 'fully_depreciated', label: 'Fully depreciated' },
            { value: 'disposed', label: 'Disposed' },
          ],
          match: (a, value) => a.status === value,
        },
      ]}
      emptyTitle="No fixed assets yet"
      emptyDescription="Add an asset to start the register."
    />
  );
}
