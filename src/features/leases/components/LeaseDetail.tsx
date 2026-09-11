import { useMemo } from 'react';
import { CalendarIcon, CircleDollarSignIcon, ClockIcon, PercentIcon, WalletCardsIcon } from 'lucide-react';
import type { Bill } from '@/types';
import type { LeaseAmortizationEntry, LeaseContract } from '@/types/lease';
import type { BankTransactionWithAllocations } from '@/features/banking/types';
import { SectionCard } from '@/components/app/page-header';
import { StatTileGrid } from '@/components/app/stat-tile';
import { projectLeasePaymentSchedule } from '../services';
import { LeasePaymentSchedule, type PeriodSettlement } from './LeasePaymentSchedule';
import { formatCurrency, formatDate } from '@/lib/app/format';

export interface LeaseDetailProps {
  lease: LeaseContract;
  amortizationHistory: LeaseAmortizationEntry[];
  /** Bills where `bill.leaseId === lease.id` — the VAT-bearing lessor tax invoices for this lease (Leases + Payroll integrity audit, PART 4). */
  relatedBills?: Bill[];
  /** Every bank transaction that settles one of this lease's amortization periods (`matchedEntityType === 'lease_amortization_entry'`, `matchedEntityId` in this lease's entry ids — FINAL HARDENING PART B). */
  settlementTransactions?: BankTransactionWithAllocations[];
  bankAccountNameById?: Map<string, string>;
  onOpenJournal: (journalEntryId: string) => void;
  onOpenBill: (billId: string) => void;
  /** Omit to hide the per-period Settle action entirely (no permission). */
  onSettle?: (leaseAmortizationEntryId: string) => void;
}

/** New — LeasesTable never had a detail view before this pass, only inline Post commencement/Terminate/Edit/Delete row actions. */
export function LeaseDetail({ lease, amortizationHistory, relatedBills = [], settlementTransactions = [], bankAccountNameById, onOpenJournal, onOpenBill, onSettle }: LeaseDetailProps) {
  const rouCarryingValue = lease.initialRightOfUseAsset - lease.accumulatedDepreciation;

  const schedule = useMemo(() => projectLeasePaymentSchedule(lease, amortizationHistory), [lease, amortizationHistory]);

  const settlementsByEntryId = useMemo(() => {
    const map = new Map<string, PeriodSettlement[]>();
    for (const tx of settlementTransactions) {
      if (tx.matchedEntityType !== 'lease_amortization_entry' || !tx.matchedEntityId) continue;
      const list = map.get(tx.matchedEntityId) ?? [];
      list.push({ id: tx.id, amount: tx.amount, date: tx.date, bankAccountName: bankAccountNameById?.get(tx.bankAccountId) ?? 'Bank account', journalEntryId: tx.journalEntryId });
      map.set(tx.matchedEntityId, list);
    }
    return map;
  }, [settlementTransactions, bankAccountNameById]);

  const billsByPeriodEnd = useMemo(() => {
    const map = new Map<string, Bill[]>();
    for (const bill of relatedBills) {
      if (!bill.leasePeriodEnd) continue;
      const key = bill.leasePeriodEnd.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(bill);
      map.set(key, list);
    }
    return map;
  }, [relatedBills]);

  const unattributedBills = relatedBills.filter((b) => !b.leasePeriodEnd);

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

      <LeasePaymentSchedule
        schedule={schedule}
        settlementsByEntryId={settlementsByEntryId}
        billsByPeriodEnd={billsByPeriodEnd}
        onOpenJournal={onOpenJournal}
        onOpenBill={onOpenBill}
        onSettle={onSettle ? (row) => row.entryId && onSettle(row.entryId) : undefined}
      />

      {unattributedBills.length > 0 && (
        <SectionCard title="Related Supplier Bills" description="VAT-bearing lessor tax invoices tagged to this lease but not to one specific period (e.g. an upfront or multi-period charge).">
          <dl className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border text-sm">
            {unattributedBills.map((bill) => (
              <div key={bill.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <dt className="flex flex-col">
                  <span className="text-foreground">{bill.billNumber}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(bill.issueDate)}</span>
                </dt>
                <dd className="flex items-center gap-3 text-sm font-medium">
                  {formatCurrency(bill.total)}
                  <button type="button" className="text-brand hover:underline" onClick={() => onOpenBill(bill.id)}>
                    View bill
                  </button>
                </dd>
              </div>
            ))}
          </dl>
        </SectionCard>
      )}
    </>
  );
}
