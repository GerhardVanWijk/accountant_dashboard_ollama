import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { CATEGORY_LABELS } from '../constants';
import type { TaxRegisterRow } from '../services';

export interface TaxRegisterTableProps {
  rows: TaxRegisterRow[];
}

/** Tax Register report, re-skinned onto v0's DataTable (M8) — every figure is read off taxRegisterService's output, no tax math performed here. */
export function TaxRegisterTable({ rows }: TaxRegisterTableProps) {
  const columns: DataTableColumn<TaxRegisterRow>[] = [
    {
      key: 'asset',
      header: 'Asset',
      sortValue: (r) => r.assetNumber,
      cell: (r) => (
        <div className="flex flex-col">
          <span className="font-mono text-sm font-medium text-foreground">{r.assetNumber}</span>
          <span className="text-xs text-muted-foreground">{r.name}</span>
        </div>
      ),
    },
    { key: 'category', header: 'Category', hideBelowMd: true, sortValue: (r) => r.category, cell: (r) => <span className="text-xs">{CATEGORY_LABELS[r.category]}</span> },
    { key: 'cost', header: 'Cost', align: 'right', hideBelowMd: true, sortValue: (r) => r.cost, cell: (r) => <Amount value={r.cost} plain className="text-sm text-muted-foreground" /> },
    {
      key: 'carrying',
      header: 'Accounting carrying value',
      align: 'right',
      sortValue: (r) => r.accountingCarryingValue,
      cell: (r) => <Amount value={r.accountingCarryingValue} plain className="text-sm" />,
    },
    {
      key: 'taxWdv',
      header: 'Tax written-down value',
      align: 'right',
      sortValue: (r) => r.taxWrittenDownValue ?? -Infinity,
      cell: (r) => (r.taxWrittenDownValue !== undefined ? <Amount value={r.taxWrittenDownValue} plain className="text-sm" /> : <span className="text-xs text-muted-foreground">No rate set</span>),
    },
    {
      key: 'diff',
      header: 'Temporary difference',
      align: 'right',
      sortValue: (r) => r.temporaryDifference ?? -Infinity,
      cell: (r) => (r.temporaryDifference !== undefined ? <Amount value={r.temporaryDifference} className="text-sm font-medium" /> : <span className="text-xs text-muted-foreground">—</span>),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowKey={(r) => r.assetId}
      searchable={(r) => [r.assetNumber, r.name, CATEGORY_LABELS[r.category]].join(' ')}
      searchPlaceholder="Search asset number, name or category"
      initialSortKey="asset"
      emptyTitle="No capitalized assets yet"
      emptyDescription="Capitalize an asset on the Asset Register to see it here."
    />
  );
}
