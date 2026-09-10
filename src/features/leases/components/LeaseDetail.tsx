import { CalendarIcon, CircleDollarSignIcon, ClockIcon, PercentIcon, WalletCardsIcon } from 'lucide-react';
import type { LeaseAmortizationEntry, LeaseContract } from '@/types/lease';
import { SectionCard } from '@/components/app/page-header';
import { Amount } from '@/components/app/figure';
import { StatTileGrid } from '@/components/app/stat-tile';
import { RecordLink } from '@/components/app/record-link';
import { formatCurrency, formatDate } from '@/lib/app/format';

export interface LeaseDetailProps {
  lease: LeaseContract;
  amortizationHistory: LeaseAmortizationEntry[];
  onOpenJournal: (journalEntryId: string) => void;
}

/** New — LeasesTable never had a detail view before this pass, only inline Post commencement/Terminate/Edit/Delete row actions. */
export function LeaseDetail({ lease, amortizationHistory, onOpenJournal }: LeaseDetailProps) {
  const rouCarryingValue = lease.initialRightOfUseAsset - lease.accumulatedDepreciation;

  return (
    <>
      <SectionCard title={lease.assetDescription} description={lease.lessorName}>
        <StatTileGrid
          columns={3}
          metrics={[
            { label: 'Outstanding liability', value: formatCurrency(lease.outstandingLeaseLiability), icon: WalletCardsIcon },
            { label: 'ROU carrying value', value: formatCurrency(rouCarryingValue), icon: CircleDollarSignIcon },
            { label: 'Monthly payment', value: formatCurrency(lease.monthlyPayment), icon: WalletCardsIcon },
            { label: 'Commenced', value: formatDate(lease.commencementDate), icon: CalendarIcon },
            { label: 'Term', value: `${lease.leaseTermMonths} months`, icon: ClockIcon },
            { label: 'Discount rate', value: `${lease.discountRatePercent}%`, icon: PercentIcon },
          ]}
        />
        {lease.status === 'terminated' && lease.terminationDate && <p className="mt-4 text-xs text-muted-foreground">Terminated {formatDate(lease.terminationDate)}.</p>}
      </SectionCard>

      {amortizationHistory.length > 0 && (
        <SectionCard title="Amortization history" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">Period end</th>
                  <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Interest</th>
                  <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Principal</th>
                  <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Liability after</th>
                  <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase" />
                </tr>
              </thead>
              <tbody>
                {amortizationHistory.map((entry) => (
                  <tr key={entry.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">{formatDate(entry.periodEnd)}</td>
                    <td className="px-4 py-2 text-right">
                      <Amount value={entry.interestAmount} plain className="text-sm" />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Amount value={entry.principalAmount} plain className="text-sm" />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Amount value={entry.outstandingLeaseLiabilityAfter} plain className="text-sm font-medium" />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <RecordLink onClick={() => onOpenJournal(entry.journalEntryId)} className="text-xs">
                        journal
                      </RecordLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </>
  );
}
