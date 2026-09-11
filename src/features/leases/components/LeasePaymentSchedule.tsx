import { useState } from 'react';
import type { Bill } from '@/types';
import type { LeasePaymentScheduleRow } from '../services';
import { RecordDetailSection } from '@/components/app/record-detail-sheet';
import { Amount } from '@/components/app/figure';
import { RecordLink } from '@/components/app/record-link';
import { Button } from '@/components/ui/shadcn/button';
import { formatDate } from '@/lib/app/format';
import { cn } from '@/lib/utils';

export interface PeriodSettlement {
  id: string;
  amount: number;
  date: string;
  bankAccountName: string;
  journalEntryId?: string;
}

export type PeriodStatus = 'Upcoming' | 'Outstanding' | 'Partially Settled' | 'Settled';

function statusFor(row: LeasePaymentScheduleRow, settledAmount: number): PeriodStatus {
  if (!row.posted) return 'Upcoming';
  if (settledAmount <= 0.005) return 'Outstanding';
  if (settledAmount >= row.payment - 0.005) return 'Settled';
  return 'Partially Settled';
}

const statusClass: Record<PeriodStatus, string> = {
  Upcoming: 'bg-muted text-muted-foreground',
  Outstanding: 'bg-status-warning-muted text-status-warning',
  'Partially Settled': 'bg-status-warning-muted text-status-warning',
  Settled: 'bg-status-positive-muted text-status-positive',
};

export interface LeasePaymentScheduleProps {
  schedule: LeasePaymentScheduleRow[];
  settlementsByEntryId: Map<string, PeriodSettlement[]>;
  billsByPeriodEnd: Map<string, Bill[]>;
  onOpenJournal: (journalEntryId: string) => void;
  onOpenBill: (billId: string) => void;
  /** Omit to hide the Settle action entirely (no permission). */
  onSettle?: (row: LeasePaymentScheduleRow) => void;
}

/**
 * The compact period-by-period payment schedule Lease Detail's Payments
 * tab shows (Leases + Payroll integrity audit, FINAL HARDENING PART B) —
 * replaces a single opaque cumulative "R25,000 outstanding" figure with
 * exactly which months make it up. Every posted period's amortisation
 * record, settlement(s), bank transaction, journal, and related Supplier
 * Bill are one click away; nothing here posts or mutates anything — this
 * is a read/drill-down + Settle-trigger surface only. No UUID is ever
 * rendered as visible text.
 */
export function LeasePaymentSchedule({ schedule, settlementsByEntryId, billsByPeriodEnd, onOpenJournal, onOpenBill, onSettle }: LeasePaymentScheduleProps) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (schedule.length === 0) {
    return (
      <RecordDetailSection title="Payment schedule">
        <p className="text-sm text-muted-foreground">No amortization periods yet.</p>
      </RecordDetailSection>
    );
  }

  return (
    <RecordDetailSection title="Payment schedule">
      <p className="text-xs text-muted-foreground">
        Each period's Lease Payment Clearing obligation, settled independently — settling one period never affects another.
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[840px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <th className="px-3 py-2 text-left">Period</th>
              <th className="px-3 py-2 text-right">Opening</th>
              <th className="px-3 py-2 text-right">Interest</th>
              <th className="px-3 py-2 text-right">Principal</th>
              <th className="px-3 py-2 text-right">Payment</th>
              <th className="px-3 py-2 text-right">Settled</th>
              <th className="px-3 py-2 text-right">Outstanding</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {schedule.map((row) => {
              const settlements = row.entryId ? (settlementsByEntryId.get(row.entryId) ?? []) : [];
              const settledAmount = settlements.reduce((s, x) => s + x.amount, 0);
              const outstanding = Math.max(0, row.payment - settledAmount);
              const status = statusFor(row, settledAmount);
              const relatedBills = billsByPeriodEnd.get(row.periodEnd) ?? [];
              const isExpanded = expanded === row.periodNumber;
              const hasDrilldown = row.posted;

              return (
                <>
                  <tr
                    key={row.periodNumber}
                    className={cn('border-b border-border last:border-0', hasDrilldown && 'cursor-pointer hover:bg-muted/30')}
                    onClick={hasDrilldown ? () => setExpanded(isExpanded ? null : row.periodNumber) : undefined}
                  >
                    <td className="px-3 py-2">
                      <span className="font-medium text-foreground">#{row.periodNumber}</span>{' '}
                      <span className="text-muted-foreground">{formatDate(row.periodEnd)}</span>
                    </td>
                    <td className="px-3 py-2 text-right"><Amount value={row.openingLiability} plain className="text-sm" /></td>
                    <td className="px-3 py-2 text-right"><Amount value={row.interest} plain className="text-sm" /></td>
                    <td className="px-3 py-2 text-right"><Amount value={row.principal} plain className="text-sm" /></td>
                    <td className="px-3 py-2 text-right font-medium"><Amount value={row.payment} plain className="text-sm font-medium" /></td>
                    <td className="px-3 py-2 text-right"><Amount value={settledAmount} plain className="text-sm" /></td>
                    <td className="px-3 py-2 text-right"><Amount value={outstanding} plain className={cn('text-sm', outstanding > 0.005 && row.posted && 'font-semibold text-status-warning')} /></td>
                    <td className="px-3 py-2">
                      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', statusClass[status])}>{status}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.posted && outstanding > 0.005 && onSettle && (
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onSettle(row); }}>
                          Settle
                        </Button>
                      )}
                    </td>
                  </tr>
                  {isExpanded && hasDrilldown && (
                    <tr className="border-b border-border bg-muted/20 last:border-0">
                      <td colSpan={9} className="px-3 py-3">
                        <div className="flex flex-col gap-3 text-xs">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="text-muted-foreground">Amortisation posting:</span>
                            {row.journalEntryId ? (
                              <RecordLink onClick={() => onOpenJournal(row.journalEntryId!)} className="text-xs">View journal</RecordLink>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                          {settlements.length > 0 ? (
                            <div className="flex flex-col gap-1.5">
                              <span className="text-muted-foreground">Settlement(s):</span>
                              {settlements.map((s) => (
                                <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-1.5">
                                  <span>{s.bankAccountName} — {formatDate(s.date)}</span>
                                  <div className="flex items-center gap-3">
                                    <Amount value={s.amount} plain className="text-xs font-medium" />
                                    {s.journalEntryId && <RecordLink onClick={() => onOpenJournal(s.journalEntryId!)} className="text-xs">journal</RecordLink>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">No settlement recorded yet for this period.</span>
                          )}
                          {relatedBills.length > 0 && (
                            <div className="flex flex-col gap-1.5">
                              <span className="text-muted-foreground">Related Supplier Bill(s):</span>
                              {relatedBills.map((b) => (
                                <div key={b.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-1.5">
                                  <span>{b.billNumber}</span>
                                  <div className="flex items-center gap-3">
                                    <Amount value={b.total} plain className="text-xs font-medium" />
                                    <RecordLink onClick={() => onOpenBill(b.id)} className="text-xs">View bill</RecordLink>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </RecordDetailSection>
  );
}
