import type { LeaseAmortizationEntry, LeaseContract } from '@/types/lease';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { formatDate } from '@/lib/app/format';

export interface AmortizationHistoryTableProps {
  entries: LeaseAmortizationEntry[];
  leases: LeaseContract[];
}

/** Lease amortization posting history, re-skinned onto v0's DataTable (M13) — every row is a real posted LeaseAmortizationEntry, no math performed here. */
export function AmortizationHistoryTable({ entries, leases }: AmortizationHistoryTableProps) {
  const leaseById = new Map(leases.map((l) => [l.id, l]));

  const columns: DataTableColumn<LeaseAmortizationEntry>[] = [
    { key: 'period', header: 'Period end', sortValue: (e) => e.periodEnd, cell: (e) => formatDate(e.periodEnd) },
    {
      key: 'lease',
      header: 'Lease',
      sortValue: (e) => leaseById.get(e.leaseId)?.leaseNumber ?? e.leaseId,
      cell: (e) => {
        const lease = leaseById.get(e.leaseId);
        return lease ? `${lease.leaseNumber} - ${lease.assetDescription}` : e.leaseId;
      },
    },
    { key: 'interest', header: 'Interest', align: 'right', sortValue: (e) => e.interestAmount, cell: (e) => <Amount value={-e.interestAmount} plain className="text-sm" /> },
    { key: 'principal', header: 'Principal', align: 'right', sortValue: (e) => e.principalAmount, cell: (e) => <Amount value={-e.principalAmount} plain className="text-sm" /> },
    { key: 'depreciation', header: 'Depreciation', align: 'right', sortValue: (e) => e.depreciationAmount, cell: (e) => <Amount value={-e.depreciationAmount} plain className="text-sm" /> },
    {
      key: 'liabilityAfter',
      header: 'Liability after',
      align: 'right',
      sortValue: (e) => e.outstandingLeaseLiabilityAfter,
      cell: (e) => <Amount value={-e.outstandingLeaseLiabilityAfter} className="text-sm font-medium" />,
    },
    {
      key: 'accumDepAfter',
      header: 'Accum. depreciation after',
      align: 'right',
      hideBelowMd: true,
      sortValue: (e) => e.accumulatedDepreciationAfter,
      cell: (e) => <Amount value={e.accumulatedDepreciationAfter} plain className="text-sm text-muted-foreground" />,
    },
  ];

  return (
    <DataTable
      rows={entries}
      columns={columns}
      getRowKey={(e) => e.id}
      searchable={(e) => [leaseById.get(e.leaseId)?.leaseNumber ?? '', leaseById.get(e.leaseId)?.assetDescription ?? ''].join(' ')}
      searchPlaceholder="Search lease number or asset"
      initialSortKey="period"
      initialSortDirection="desc"
      emptyTitle="No lease amortization posted yet"
      emptyDescription="Run amortization once a lease has commenced on the Lease Register."
    />
  );
}
