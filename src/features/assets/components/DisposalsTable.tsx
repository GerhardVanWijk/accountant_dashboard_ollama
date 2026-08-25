import type { AssetDisposal, FixedAsset } from '@/types';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { formatDate } from '@/lib/app/format';

export interface DisposalsTableProps {
  disposals: AssetDisposal[];
  assets: FixedAsset[];
}

/** Asset disposal ledger, re-skinned onto v0's DataTable (M8) — gain/loss is read from the posted AssetDisposal record, not recomputed. */
export function DisposalsTable({ disposals, assets }: DisposalsTableProps) {
  const assetById = new Map(assets.map((a) => [a.id, a]));

  const columns: DataTableColumn<AssetDisposal>[] = [
    { key: 'date', header: 'Disposal date', sortValue: (d) => d.disposalDate, cell: (d) => formatDate(d.disposalDate) },
    {
      key: 'asset',
      header: 'Asset',
      sortValue: (d) => assetById.get(d.assetId)?.assetNumber ?? d.assetId,
      cell: (d) => {
        const asset = assetById.get(d.assetId);
        return asset ? `${asset.assetNumber} - ${asset.name}` : d.assetId;
      },
    },
    {
      key: 'carrying',
      header: 'Carrying value',
      align: 'right',
      hideBelowMd: true,
      sortValue: (d) => d.carryingValueAtDisposal,
      cell: (d) => <Amount value={d.carryingValueAtDisposal} plain className="text-sm text-muted-foreground" />,
    },
    { key: 'proceeds', header: 'Proceeds', align: 'right', sortValue: (d) => d.proceeds, cell: (d) => <Amount value={d.proceeds} plain className="text-sm" /> },
    {
      key: 'gainLoss',
      header: 'Gain / loss',
      align: 'right',
      sortValue: (d) => d.gainLoss,
      cell: (d) => <Amount value={d.gainLoss} className="text-sm font-medium" />,
    },
  ];

  return (
    <DataTable
      rows={disposals}
      columns={columns}
      getRowKey={(d) => d.id}
      searchable={(d) => [assetById.get(d.assetId)?.assetNumber ?? '', assetById.get(d.assetId)?.name ?? ''].join(' ')}
      searchPlaceholder="Search asset number or name"
      initialSortKey="date"
      initialSortDirection="desc"
      emptyTitle="No disposals yet"
      emptyDescription="Dispose of a capitalized asset to record it here."
    />
  );
}
