import type { PayrollRun } from '@/types';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/shadcn/button';
import { formatDate } from '@/lib/app/format';

export interface PayrollRunsTableProps {
  runs: PayrollRun[];
  onView: (run: PayrollRun) => void;
  /** Omit (gated by payroll:delete) to hide the Delete row action entirely. */
  onDelete?: (run: PayrollRun) => void;
}

/** Payroll run register, re-skinned onto v0's DataTable (M13) — net pay is read off the already-computed PayrollRun record, no payroll math performed here. */
export function PayrollRunsTable({ runs, onView, onDelete }: PayrollRunsTableProps) {
  const columns: DataTableColumn<PayrollRun>[] = [
    { key: 'number', header: 'Run', sortValue: (r) => r.runNumber, cell: (r) => <span className="figure font-mono text-sm font-medium">{r.runNumber}</span> },
    {
      key: 'period',
      header: 'Pay period',
      sortValue: (r) => r.payPeriodStart,
      cell: (r) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(r.payPeriodStart)} – {formatDate(r.payPeriodEnd)}
        </span>
      ),
    },
    { key: 'payDate', header: 'Pay date', sortValue: (r) => r.payDate, cell: (r) => formatDate(r.payDate) },
    { key: 'employees', header: 'Employees', align: 'right', hideBelowMd: true, sortValue: (r) => r.payslips.length, cell: (r) => <span className="figure tabular-nums">{r.payslips.length}</span> },
    {
      key: 'netPay',
      header: 'Net pay',
      align: 'right',
      sortValue: (r) => r.payslips.reduce((sum, p) => sum + p.netPay, 0),
      cell: (r) => <Amount value={r.payslips.reduce((sum, p) => sum + p.netPay, 0)} className="text-sm font-medium" />,
    },
    { key: 'status', header: 'Status', sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'actions',
      header: '',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => onView(r)}>
            {r.status === 'draft' ? 'Review' : 'View'}
          </Button>
          {r.status === 'draft' && onDelete && (
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(r)}>
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      rows={runs}
      columns={columns}
      getRowKey={(r) => r.id}
      searchable={(r) => [r.runNumber, r.payDate].join(' ')}
      searchPlaceholder="Search by run number"
      initialSortKey="payDate"
      initialSortDirection="desc"
      filters={[
        {
          key: 'status',
          label: 'All statuses',
          options: [
            { value: 'draft', label: 'Draft' },
            { value: 'posted', label: 'Posted' },
          ],
          match: (r, value) => r.status === value,
        },
      ]}
      emptyTitle="No payroll runs yet"
      emptyDescription="Create a payroll run to pay your employees."
    />
  );
}
