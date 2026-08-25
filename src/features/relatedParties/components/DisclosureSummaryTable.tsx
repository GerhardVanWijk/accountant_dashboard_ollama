import type { RelatedPartyDisclosureSummaryRow } from '../services';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { RELATIONSHIP_TYPE_LABELS } from '../constants';

export interface DisclosureSummaryTableProps {
  rows: RelatedPartyDisclosureSummaryRow[];
}

/**
 * Renders the per-related-party disclosure summary ("available for
 * financial statement disclosure") — one row per related party with at
 * least one transaction, built by buildRelatedPartyDisclosureSummary().
 * Re-skinned onto v0's DataTable (M13); no disclosure math performed here.
 */
export function DisclosureSummaryTable({ rows }: DisclosureSummaryTableProps) {
  const columns: DataTableColumn<RelatedPartyDisclosureSummaryRow>[] = [
    { key: 'name', header: 'Related party', sortValue: (r) => r.name, cell: (r) => <span className="font-medium text-foreground">{r.name}</span> },
    { key: 'relationship', header: 'Relationship', sortValue: (r) => r.relationshipType, cell: (r) => RELATIONSHIP_TYPE_LABELS[r.relationshipType] },
    { key: 'count', header: 'Transaction count', align: 'right', sortValue: (r) => r.transactionCount, cell: (r) => <span className="figure text-sm tabular-nums">{r.transactionCount}</span> },
    { key: 'total', header: 'Total amount', align: 'right', sortValue: (r) => r.totalAmount, cell: (r) => <Amount value={r.totalAmount} className="text-sm font-medium" /> },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowKey={(r) => r.relatedPartyId}
      searchable={(r) => [r.name, RELATIONSHIP_TYPE_LABELS[r.relationshipType]].join(' ')}
      searchPlaceholder="Search by related party"
      initialSortKey="name"
      emptyTitle="Nothing to disclose yet"
      emptyDescription="Record at least one transaction to see it summarized here."
    />
  );
}
