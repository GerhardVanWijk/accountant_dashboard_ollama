import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { Badge } from '@/components/ui/shadcn/badge';
import { formatDate } from '@/lib/app/format';
import { treatmentLabels } from '../utils/treatmentLabels';
import type { VatTransactionRow } from '../services/vatReportService';

const DOCUMENT_TYPE_LABELS: Record<VatTransactionRow['documentType'], string> = {
  invoice: 'Invoice',
  credit_note: 'Credit Note',
  bill: 'Bill',
};

/**
 * Real posted Invoices/Credit Notes/Bills contributing to the selected VAT
 * period, re-skinned onto v0's DataTable (M7) — same transaction-traceability
 * purpose as v0's own `vat-transactions-table.tsx`, but sourced from
 * `vatReportService.listVatTransactions()` (real documents, real
 * treatments) rather than mock rows. No second VAT calculation happens
 * here — every figure is handed in already-computed.
 */
export function VatTransactionsTable({ transactions }: { transactions: VatTransactionRow[] }) {
  const columns: DataTableColumn<VatTransactionRow>[] = [
    {
      key: 'date',
      header: 'Date',
      sortValue: (t) => t.date,
      cell: (t) => <span className="whitespace-nowrap">{formatDate(t.date)}</span>,
    },
    {
      key: 'documentNumber',
      header: 'Document',
      sortValue: (t) => t.documentNumber,
      cell: (t) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{t.documentNumber}</span>
          <span className="text-xs text-muted-foreground">{DOCUMENT_TYPE_LABELS[t.documentType]}</span>
        </div>
      ),
    },
    {
      key: 'direction',
      header: 'Direction',
      sortValue: (t) => t.direction,
      cell: (t) => (
        <Badge variant="outline" className="capitalize">
          {t.direction}
        </Badge>
      ),
    },
    {
      key: 'treatment',
      header: 'Treatment',
      sortValue: (t) => t.treatment ?? '',
      cell: (t) => (t.treatment ? treatmentLabels[t.treatment] : <span className="text-muted-foreground">Unresolved</span>),
    },
    {
      key: 'taxBase',
      header: 'Tax Base',
      align: 'right',
      sortValue: (t) => t.taxBase,
      cell: (t) => <Amount value={t.taxBase} />,
    },
    {
      key: 'vatAmount',
      header: 'VAT Amount',
      align: 'right',
      sortValue: (t) => t.vatAmount,
      cell: (t) => <Amount value={t.vatAmount} className="font-medium" />,
    },
  ];

  return (
    <DataTable
      rows={transactions}
      columns={columns}
      getRowKey={(t) => `${t.documentType}_${t.id}`}
      searchable={(t) => t.documentNumber}
      searchPlaceholder="Search document number"
      initialSortKey="date"
      initialSortDirection="asc"
      pageSize={10}
      emptyTitle="No VAT transactions this period"
      emptyDescription="No posted invoice, credit note, or bill carried VAT in the selected period."
    />
  );
}
