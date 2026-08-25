import type { RelatedParty, RelatedPartyTransaction } from '@/types/relatedParty';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { formatDate } from '@/lib/app/format';

export interface RelatedPartyTransactionsTableProps {
  transactions: RelatedPartyTransaction[];
  relatedPartiesById: Map<string, RelatedParty>;
  onEdit: (transaction: RelatedPartyTransaction) => void;
  onDelete: (transaction: RelatedPartyTransaction) => void;
}

/** Related Party Transactions register, re-skinned onto v0's DataTable (M13) — mirrors RelatedPartiesTable.tsx's shape. */
export function RelatedPartyTransactionsTable({ transactions, relatedPartiesById, onEdit, onDelete }: RelatedPartyTransactionsTableProps) {
  const columns: DataTableColumn<RelatedPartyTransaction>[] = [
    { key: 'date', header: 'Date', sortValue: (t) => t.transactionDate, cell: (t) => formatDate(t.transactionDate) },
    {
      key: 'party',
      header: 'Related party',
      sortValue: (t) => relatedPartiesById.get(t.relatedPartyId)?.name ?? '',
      cell: (t) => relatedPartiesById.get(t.relatedPartyId)?.name ?? 'Unknown',
    },
    { key: 'nature', header: 'Nature', sortValue: (t) => t.natureOfTransaction, cell: (t) => t.natureOfTransaction },
    { key: 'amount', header: 'Amount', align: 'right', sortValue: (t) => t.amount, cell: (t) => <Amount value={t.amount} className="text-sm font-medium" /> },
    { key: 'description', header: 'Description', hideBelowMd: true, cell: (t) => <span className="max-w-xs truncate text-muted-foreground">{t.description ?? '—'}</span> },
    {
      key: 'actions',
      header: '',
      cell: (t) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => onEdit(t)}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(t)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      rows={transactions}
      columns={columns}
      getRowKey={(t) => t.id}
      searchable={(t) => [relatedPartiesById.get(t.relatedPartyId)?.name ?? '', t.natureOfTransaction, t.description ?? ''].join(' ')}
      searchPlaceholder="Search by related party or nature"
      initialSortKey="date"
      initialSortDirection="desc"
      emptyTitle="No related party transactions yet"
      emptyDescription="Record a transaction to start building the disclosure history."
    />
  );
}
