import type { RelatedParty } from '@/types/relatedParty';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/shadcn/button';
import { RELATIONSHIP_TYPE_LABELS } from '../constants';

export interface RelatedPartiesTableProps {
  relatedParties: RelatedParty[];
  transactionCountByPartyId: Map<string, number>;
  onEdit: (relatedParty: RelatedParty) => void;
  onDelete: (relatedParty: RelatedParty) => void;
}

/** Related Party Register, re-skinned onto v0's DataTable (M13) — mirrors AssetsTable.tsx's shape. */
export function RelatedPartiesTable({ relatedParties, transactionCountByPartyId, onEdit, onDelete }: RelatedPartiesTableProps) {
  const columns: DataTableColumn<RelatedParty>[] = [
    { key: 'name', header: 'Name', sortValue: (p) => p.name, cell: (p) => <span className="font-medium text-foreground">{p.name}</span> },
    { key: 'type', header: 'Relationship type', sortValue: (p) => p.relationshipType, cell: (p) => <span className="text-xs">{RELATIONSHIP_TYPE_LABELS[p.relationshipType]}</span> },
    { key: 'detail', header: 'Detail', hideBelowMd: true, cell: (p) => <span className="max-w-xs truncate text-xs text-muted-foreground">{p.relationshipDetail ?? '—'}</span> },
    {
      key: 'transactions',
      header: 'Transactions',
      align: 'right',
      sortValue: (p) => transactionCountByPartyId.get(p.id) ?? 0,
      cell: (p) => <span className="figure text-sm tabular-nums">{transactionCountByPartyId.get(p.id) ?? 0}</span>,
    },
    { key: 'status', header: 'Status', sortValue: (p) => (p.isActive ? 'active' : 'inactive'), cell: (p) => <StatusBadge status={p.isActive ? 'active' : 'inactive'} /> },
    {
      key: 'actions',
      header: '',
      cell: (p) => {
        const transactionCount = transactionCountByPartyId.get(p.id) ?? 0;
        return (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => onEdit(p)}>
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={transactionCount > 0}
              title={transactionCount > 0 ? 'Referenced by an existing related-party transaction — remove those first.' : undefined}
              onClick={() => onDelete(p)}
            >
              Delete
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <DataTable
      rows={relatedParties}
      columns={columns}
      getRowKey={(p) => p.id}
      searchable={(p) => [p.name, RELATIONSHIP_TYPE_LABELS[p.relationshipType], p.relationshipDetail ?? ''].join(' ')}
      searchPlaceholder="Search by name or relationship"
      initialSortKey="name"
      filters={[
        {
          key: 'status',
          label: 'All statuses',
          options: [
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ],
          match: (p, value) => (p.isActive ? 'active' : 'inactive') === value,
        },
      ]}
      emptyTitle="No related parties yet"
      emptyDescription="Add a director, shareholder, subsidiary, associate, or other related entity to start the register."
    />
  );
}
