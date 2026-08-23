import type { LeaseAmortizationEntry, LeaseContract } from '@/types/lease';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';

export interface AmortizationHistoryTableProps {
  entries: LeaseAmortizationEntry[];
  leases: LeaseContract[];
}

export function AmortizationHistoryTable({ entries, leases }: AmortizationHistoryTableProps) {
  const leaseById = new Map(leases.map((l) => [l.id, l]));
  const sorted = [...entries].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[920px] border-collapse text-left text-sm">
        <thead className="bg-background">
          <tr>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Period End</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Lease</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Interest</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Principal</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Depreciation</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Liability After</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Accum. Depreciation After</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry) => {
            const lease = leaseById.get(entry.leaseId);
            return (
              <tr key={entry.id} className="border-t border-border">
                <td className="whitespace-nowrap px-md py-sm text-text-primary">{entry.periodEnd}</td>
                <td className="whitespace-nowrap px-md py-sm text-text-primary">
                  {lease ? `${lease.leaseNumber} - ${lease.assetDescription}` : entry.leaseId}
                </td>
                <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                  <FinancialNumber value={entry.interestAmount} format={formatCurrency} showFlash={false} isInverted />
                </td>
                <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                  <FinancialNumber value={entry.principalAmount} format={formatCurrency} showFlash={false} isInverted />
                </td>
                <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                  <FinancialNumber value={entry.depreciationAmount} format={formatCurrency} showFlash={false} isInverted />
                </td>
                <td className="whitespace-nowrap px-md py-sm text-right font-semibold tabular-nums">
                  <FinancialNumber value={entry.outstandingLeaseLiabilityAfter} format={formatCurrency} showFlash={false} />
                </td>
                <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                  <FinancialNumber value={entry.accumulatedDepreciationAfter} format={formatCurrency} showFlash={false} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
