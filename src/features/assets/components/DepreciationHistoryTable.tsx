import { useNavigate } from 'react-router-dom';
import type { DepreciationEntry, FixedAsset } from '@/types';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { RecordLink } from '@/components/app/record-link';
import { formatDate } from '@/lib/app/format';

export interface DepreciationHistoryTableProps {
  entries: DepreciationEntry[];
  assets: FixedAsset[];
}

/** Depreciation posting history, re-skinned onto v0's DataTable (M8) — every row is a real posted DepreciationEntry, no math performed here. */
export function DepreciationHistoryTable({ entries, assets }: DepreciationHistoryTableProps) {
  const navigate = useNavigate();
  const assetById = new Map(assets.map((a) => [a.id, a]));

  const columns: DataTableColumn<DepreciationEntry>[] = [
    { key: 'period', header: 'Period end', sortValue: (e) => e.periodEnd, cell: (e) => formatDate(e.periodEnd) },
    {
      key: 'asset',
      header: 'Asset',
      sortValue: (e) => assetById.get(e.assetId)?.assetNumber ?? e.assetId,
      cell: (e) => {
        const asset = assetById.get(e.assetId);
        return (
          <RecordLink onClick={() => navigate(`/assets/register?record=${e.assetId}`)} className="text-sm">
            {asset ? `${asset.assetNumber} - ${asset.name}` : e.assetId}
          </RecordLink>
        );
      },
    },
    { key: 'charge', header: 'Charge', align: 'right', sortValue: (e) => e.amount, cell: (e) => <Amount value={-e.amount} plain className="text-sm" /> },
    {
      key: 'accumAfter',
      header: 'Accum. depreciation after',
      align: 'right',
      hideBelowMd: true,
      sortValue: (e) => e.accumulatedDepreciationAfter,
      cell: (e) => <Amount value={e.accumulatedDepreciationAfter} plain className="text-sm text-muted-foreground" />,
    },
    {
      key: 'carryingAfter',
      header: 'Carrying value after',
      align: 'right',
      sortValue: (e) => e.carryingValueAfter,
      cell: (e) => <Amount value={e.carryingValueAfter} className="text-sm font-medium" />,
    },
  ];

  return (
    <DataTable
      rows={entries}
      columns={columns}
      getRowKey={(e) => e.id}
      searchable={(e) => [assetById.get(e.assetId)?.assetNumber ?? '', assetById.get(e.assetId)?.name ?? ''].join(' ')}
      searchPlaceholder="Search asset number or name"
      initialSortKey="period"
      initialSortDirection="desc"
      emptyTitle="No depreciation posted yet"
      emptyDescription="Run depreciation once an asset has been capitalized on the Asset Register."
    />
  );
}
