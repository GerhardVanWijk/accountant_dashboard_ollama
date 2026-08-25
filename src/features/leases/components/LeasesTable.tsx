import type { LeaseContract } from '@/types/lease';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/shadcn/button';
import { calculateCurrentPortionForLease } from '../services';

export interface LeasesTableProps {
  leases: LeaseContract[];
  /** leaseId -> number of amortization runs already completed for it — drives the current-portion simulation horizon. */
  completedAmortizationRunsByLease: Record<string, number>;
  onEdit: (lease: LeaseContract) => void;
  onPostCommencement: (lease: LeaseContract) => void;
  onTerminate: (lease: LeaseContract) => void;
  onDelete: (lease: LeaseContract) => void;
}

/** Lease register, re-skinned onto v0's DataTable (M13) — every figure (outstanding liability, ROU carrying value, current portion) is read off the real LeaseContract record or `calculateCurrentPortionForLease()`, no lease math performed here. */
export function LeasesTable({ leases, completedAmortizationRunsByLease, onEdit, onPostCommencement, onTerminate, onDelete }: LeasesTableProps) {
  const columns: DataTableColumn<LeaseContract>[] = [
    {
      key: 'number',
      header: 'Lease',
      sortValue: (l) => l.leaseNumber,
      cell: (l) => (
        <div className="flex flex-col">
          <span className="font-mono text-sm font-medium text-foreground">{l.leaseNumber}</span>
          <span className="text-xs text-muted-foreground">{l.assetDescription}</span>
        </div>
      ),
    },
    { key: 'lessor', header: 'Lessor', hideBelowMd: true, sortValue: (l) => l.lessorName, cell: (l) => <span className="text-xs">{l.lessorName}</span> },
    { key: 'term', header: 'Term (months)', align: 'right', hideBelowMd: true, sortValue: (l) => l.leaseTermMonths, cell: (l) => <span className="figure text-sm tabular-nums">{l.leaseTermMonths}</span> },
    { key: 'payment', header: 'Monthly payment', align: 'right', hideBelowMd: true, sortValue: (l) => l.monthlyPayment, cell: (l) => <Amount value={l.monthlyPayment} plain className="text-sm text-muted-foreground" /> },
    {
      key: 'liability',
      header: 'Outstanding liability',
      align: 'right',
      sortValue: (l) => l.outstandingLeaseLiability,
      cell: (l) => <Amount value={-l.outstandingLeaseLiability} plain className="text-sm" />,
    },
    {
      key: 'rou',
      header: 'ROU carrying value',
      align: 'right',
      sortValue: (l) => l.initialRightOfUseAsset - l.accumulatedDepreciation,
      cell: (l) => <Amount value={l.initialRightOfUseAsset - l.accumulatedDepreciation} className="text-sm font-medium" />,
    },
    {
      key: 'currentPortion',
      header: 'Current portion (12mo)',
      align: 'right',
      hideBelowMd: true,
      sortValue: (l) => (l.status === 'active' ? calculateCurrentPortionForLease(l, completedAmortizationRunsByLease[l.id] ?? 0) : 0),
      cell: (l) => <Amount value={-(l.status === 'active' ? calculateCurrentPortionForLease(l, completedAmortizationRunsByLease[l.id] ?? 0) : 0)} plain className="text-sm" />,
    },
    { key: 'status', header: 'Status', sortValue: (l) => l.status, cell: (l) => <StatusBadge status={l.status} /> },
    {
      key: 'actions',
      header: '',
      cell: (l) => (
        <div className="flex justify-end gap-1">
          {l.status === 'draft' && (
            <Button variant="ghost" size="sm" onClick={() => onPostCommencement(l)}>
              Post commencement
            </Button>
          )}
          {l.status === 'active' && (
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onTerminate(l)}>
              Terminate
            </Button>
          )}
          {l.status === 'draft' && (
            <>
              <Button variant="ghost" size="sm" onClick={() => onEdit(l)}>
                Edit
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(l)}>
                Delete
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      rows={leases}
      columns={columns}
      getRowKey={(l) => l.id}
      searchable={(l) => [l.leaseNumber, l.lessorName, l.assetDescription].join(' ')}
      searchPlaceholder="Search by lease number, lessor or asset"
      initialSortKey="number"
      filters={[
        {
          key: 'status',
          label: 'All statuses',
          options: [
            { value: 'draft', label: 'Draft' },
            { value: 'active', label: 'Active' },
            { value: 'terminated', label: 'Terminated' },
          ],
          match: (l, value) => l.status === value,
        },
      ]}
      emptyTitle="No leases yet"
      emptyDescription="Add a lease to start the register."
    />
  );
}
