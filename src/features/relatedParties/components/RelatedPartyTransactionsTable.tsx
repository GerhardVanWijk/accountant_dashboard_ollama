import { useNavigate } from 'react-router-dom';
import type { RelatedParty, RelatedPartySourceDocumentType, RelatedPartyTransaction } from '@/types/relatedParty';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { RecordLink } from '@/components/app/record-link';
import { formatDate } from '@/lib/app/format';

export interface RelatedPartyTransactionsTableProps {
  transactions: RelatedPartyTransaction[];
  relatedPartiesById: Map<string, RelatedParty>;
  onEdit: (transaction: RelatedPartyTransaction) => void;
  onDelete: (transaction: RelatedPartyTransaction) => void;
  /** Hides Edit/Delete for a caller without `compliance:update`. Defaults to true so existing callers/tests are unaffected. */
  canUpdate?: boolean;
}

const SOURCE_ROUTE: Record<RelatedPartySourceDocumentType, string> = {
  invoice: '/sales/invoices',
  bill: '/purchases/bills',
  journal_entry: '/accounting/journals',
  customer_receipt: '/sales/receipts',
  payment: '/purchases/payments',
};

const SOURCE_LABEL: Record<RelatedPartySourceDocumentType, string> = {
  invoice: 'Invoice',
  bill: 'Bill',
  journal_entry: 'Journal',
  customer_receipt: 'Receipt',
  payment: 'Payment',
};

/** Related Party Transactions register, re-skinned onto v0's DataTable (M13) — mirrors RelatedPartiesTable.tsx's shape. */
export function RelatedPartyTransactionsTable({ transactions, relatedPartiesById, onEdit, onDelete, canUpdate = true }: RelatedPartyTransactionsTableProps) {
  const navigate = useNavigate();

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
    {
      key: 'source',
      header: 'Source',
      hideBelowMd: true,
      cell: (t) =>
        t.sourceDocumentType && t.sourceDocumentId ? (
          <RecordLink onClick={() => navigate(`${SOURCE_ROUTE[t.sourceDocumentType!]}?record=${t.sourceDocumentId}`)} className="text-xs">
            {SOURCE_LABEL[t.sourceDocumentType]} {t.sourceReference ? `· ${t.sourceReference}` : ''}
          </RecordLink>
        ) : (
          <span className="text-xs text-muted-foreground">Manual / Other</span>
        ),
    },
    { key: 'description', header: 'Description', hideBelowMd: true, cell: (t) => <span className="max-w-xs truncate text-muted-foreground">{t.description ?? '—'}</span> },
    {
      key: 'actions',
      header: '',
      cell: (t) =>
        canUpdate ? (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => onEdit(t)}>
              Edit
            </Button>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(t)}>
              Delete
            </Button>
          </div>
        ) : null,
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
