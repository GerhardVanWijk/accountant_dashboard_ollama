import type { LeaseContract, LeaseStatus } from '@/types/lease';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import { cn } from '@/utils/cn';
import { calculateCurrentPortionForLease } from '../services';

const STATUS_STYLES: Record<LeaseStatus, string> = {
  draft: 'bg-text-muted/10 text-text-secondary',
  active: 'bg-positive/10 text-positive',
  terminated: 'bg-text-muted/10 text-text-muted',
};

const STATUS_LABELS: Record<LeaseStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  terminated: 'Terminated',
};

export interface LeasesTableProps {
  leases: LeaseContract[];
  /** leaseId -> number of amortization runs already completed for it — drives the current-portion simulation horizon. */
  completedAmortizationRunsByLease: Record<string, number>;
  onEdit: (lease: LeaseContract) => void;
  onPostCommencement: (lease: LeaseContract) => void;
  onTerminate: (lease: LeaseContract) => void;
  onDelete: (lease: LeaseContract) => void;
}

export function LeasesTable({
  leases,
  completedAmortizationRunsByLease,
  onEdit,
  onPostCommencement,
  onTerminate,
  onDelete,
}: LeasesTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
        <thead className="bg-background">
          <tr>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Lease #</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Lessor</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Term (Months)</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Monthly Payment</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Status</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Outstanding Liability</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">ROU Carrying Value</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Current Portion (12mo)</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary" />
          </tr>
        </thead>
        <tbody>
          {leases.map((lease) => {
            const rouCarryingValue = lease.initialRightOfUseAsset - lease.accumulatedDepreciation;
            const currentPortion =
              lease.status === 'active'
                ? calculateCurrentPortionForLease(lease, completedAmortizationRunsByLease[lease.id] ?? 0)
                : 0;
            return (
              <tr key={lease.id} className="border-t border-border hover:bg-background">
                <td className="whitespace-nowrap px-md py-sm font-mono text-text-primary">{lease.leaseNumber}</td>
                <td className="whitespace-nowrap px-md py-sm text-text-primary">{lease.lessorName}</td>
                <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">{lease.leaseTermMonths}</td>
                <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                  <FinancialNumber value={lease.monthlyPayment} format={formatCurrency} showFlash={false} />
                </td>
                <td className="whitespace-nowrap px-md py-sm">
                  <span className={cn('inline-flex items-center rounded-full px-sm py-0.5 text-xs font-medium', STATUS_STYLES[lease.status])}>
                    {STATUS_LABELS[lease.status]}
                  </span>
                </td>
                <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                  <FinancialNumber value={lease.outstandingLeaseLiability} format={formatCurrency} showFlash={false} isInverted />
                </td>
                <td className="whitespace-nowrap px-md py-sm text-right font-semibold tabular-nums">
                  <FinancialNumber value={rouCarryingValue} format={formatCurrency} showFlash={false} />
                </td>
                <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                  <FinancialNumber value={currentPortion} format={formatCurrency} showFlash={false} isInverted />
                </td>
                <td className="whitespace-nowrap px-md py-sm">
                  <div className="flex justify-end gap-sm">
                    {lease.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => onPostCommencement(lease)}
                        className="rounded-md px-sm py-xs text-xs font-medium text-primary hover:underline"
                      >
                        Post Commencement
                      </button>
                    )}
                    {lease.status === 'active' && (
                      <button
                        type="button"
                        onClick={() => onTerminate(lease)}
                        className="rounded-md px-sm py-xs text-xs font-medium text-danger hover:underline"
                      >
                        Terminate
                      </button>
                    )}
                    {lease.status === 'draft' && (
                      <>
                        <button
                          type="button"
                          onClick={() => onEdit(lease)}
                          className="rounded-md px-sm py-xs text-xs font-medium text-primary hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(lease)}
                          className="rounded-md px-sm py-xs text-xs font-medium text-danger hover:underline"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
