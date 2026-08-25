import type { DividendDeclaration } from '@/types';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/shadcn/button';
import { formatDate } from '@/lib/app/format';
import { getRemittanceDueDateHint } from '../services';

export interface DividendDeclarationsTableProps {
  declarations: DividendDeclaration[];
  onDeclare: (declaration: DividendDeclaration) => void;
  onPay: (declaration: DividendDeclaration) => void;
  onRemit: (declaration: DividendDeclaration) => void;
  onDelete: (declaration: DividendDeclaration) => void;
}

/** Dividend declarations list, re-skinned onto v0's DataTable (M7). Same declare/pay/remit/delete lifecycle actions, same real DividendDeclarationStatus. */
export function DividendDeclarationsTable({ declarations, onDeclare, onPay, onRemit, onDelete }: DividendDeclarationsTableProps) {
  const columns: DataTableColumn<DividendDeclaration>[] = [
    {
      key: 'date',
      header: 'Date',
      sortValue: (d) => d.declarationDate,
      cell: (d) => <span className="whitespace-nowrap font-mono text-sm">{formatDate(d.declarationDate)}</span>,
    },
    { key: 'total', header: 'Total Amount', align: 'right', sortValue: (d) => d.totalAmount, cell: (d) => <Amount value={d.totalAmount} /> },
    { key: 'exempt', header: 'Exempt', align: 'right', sortValue: (d) => d.exemptPortion, cell: (d) => <Amount value={d.exemptPortion} /> },
    { key: 'taxable', header: 'Taxable', align: 'right', sortValue: (d) => d.taxableAmount, cell: (d) => <Amount value={d.taxableAmount} /> },
    { key: 'withheld', header: 'Tax Withheld', align: 'right', sortValue: (d) => d.dividendsTaxWithheld, cell: (d) => <Amount value={d.dividendsTaxWithheld} /> },
    { key: 'net', header: 'Net Payable', align: 'right', sortValue: (d) => d.netPayableToShareholders, cell: (d) => <Amount value={d.netPayableToShareholders} className="font-medium" /> },
    { key: 'status', header: 'Status', sortValue: (d) => d.status, cell: (d) => <StatusBadge status={d.status} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (d) => (
        <div className="flex flex-wrap items-center justify-end gap-1">
          {d.status === 'draft' && (
            <>
              <Button variant="ghost" size="sm" onClick={() => onDeclare(d)}>
                Declare
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => onDelete(d)}>
                Delete
              </Button>
            </>
          )}
          {d.status === 'declared' && (
            <Button variant="ghost" size="sm" onClick={() => onPay(d)}>
              Pay
            </Button>
          )}
          {d.status === 'paid' && (
            <div className="flex flex-col items-end gap-0.5">
              <Button variant="ghost" size="sm" onClick={() => onRemit(d)}>
                Remit to SARS
              </Button>
              {d.paidDate && <span className="text-xs text-muted-foreground">Due by {getRemittanceDueDateHint(d.paidDate)}</span>}
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      rows={declarations}
      columns={columns}
      getRowKey={(d) => d.id}
      initialSortKey="date"
      initialSortDirection="desc"
      pageSize={15}
      emptyTitle="No dividend declarations yet"
      emptyDescription="Create a declaration to start the Dividends Tax lifecycle."
    />
  );
}
