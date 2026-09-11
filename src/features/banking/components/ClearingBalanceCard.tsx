import { CheckCircle2Icon, CircleDashedIcon, CircleDollarSignIcon } from 'lucide-react';
import { RecordDetailSection } from '@/components/app/record-detail-sheet';
import { StatStrip, StatTile } from '@/components/app/stat-tile';
import { RecordLink } from '@/components/app/record-link';
import { Button } from '@/components/ui/shadcn/button';
import { Amount } from '@/components/app/figure';
import { formatCurrency, formatDate } from '@/lib/app/format';

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface ClearingBalanceSettlement {
  id: string;
  date: string;
  amount: number;
  bankAccountName: string;
  journalEntryId?: string;
}

export interface ClearingBalanceCardProps {
  /** e.g. "Net pay settlement" / "Lease payment settlement". */
  title: string;
  /** e.g. "2250 · Net Pay Payable". */
  clearingAccountLabel: string;
  /** The amount this record originally credited to the clearing account. */
  originalAmount: number;
  settlements: ClearingBalanceSettlement[];
  onOpenJournal: (journalEntryId: string) => void;
  /** Omit to hide the Settle action entirely (e.g. no permission, or nothing to settle yet). */
  onSettle?: () => void;
}

/**
 * The clearing-balance status every posted PayrollRun / active Lease must
 * show (Leases + Payroll integrity audit, PART 3 — Banking settlement UX):
 * original amount, amount settled, amount outstanding, the clearing
 * account, and every linked bank transaction with its own journal —
 * "bank transaction -> clearing liability -> payroll run/lease" made
 * visible, not just theoretically traceable. Once nothing is outstanding
 * the card renders as a read-only "Fully settled" state — `onSettle` should
 * be omitted by the caller in that case so a second settlement of the same
 * balance is structurally unreachable from the UI, not just discouraged.
 */
export function ClearingBalanceCard({ title, clearingAccountLabel, originalAmount, settlements, onOpenJournal, onSettle }: ClearingBalanceCardProps) {
  const settledAmount = round2(settlements.reduce((sum, s) => sum + s.amount, 0));
  const outstanding = round2(originalAmount - settledAmount);
  const isFullySettled = outstanding <= 0.005;

  return (
    <RecordDetailSection
      title={title}
      actions={
        onSettle && !isFullySettled ? (
          <Button size="sm" onClick={onSettle}>
            Settle
          </Button>
        ) : undefined
      }
    >
      <StatStrip columns={3}>
        <StatTile variant="compact" icon={CircleDollarSignIcon} label="Original amount" value={formatCurrency(originalAmount)} />
        <StatTile variant="compact" icon={CheckCircle2Icon} label="Settled" value={formatCurrency(settledAmount)} />
        <StatTile
          variant="compact"
          icon={CircleDashedIcon}
          label="Outstanding"
          value={formatCurrency(outstanding)}
          tone={isFullySettled ? undefined : 'warning'}
        />
      </StatStrip>

      <p className="text-xs text-muted-foreground">
        Clearing account: <span className="font-medium text-foreground">{clearingAccountLabel}</span> — credited by
        this record, never Cash and Bank directly. Cleared to zero once the real bank movement below is recorded.
      </p>

      {isFullySettled ? (
        <p className="rounded-lg border border-status-positive-outline bg-status-positive-surface/40 px-3 py-2 text-sm text-status-positive">
          Fully settled — nothing outstanding.
        </p>
      ) : (
        <p className="rounded-lg border border-status-warning-outline bg-status-warning-surface/40 px-3 py-2 text-sm text-status-warning">
          {settlements.length === 0 ? 'Not yet settled.' : 'Partially settled.'} Record the real bank movement once it
          clears — never post it as a second, separate expense/payment.
        </p>
      )}

      {settlements.length > 0 && (
        <dl className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border text-sm">
          {settlements.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <dt className="flex flex-col">
                <span className="text-foreground">{s.bankAccountName}</span>
                <span className="text-xs text-muted-foreground">{formatDate(s.date)}</span>
              </dt>
              <dd className="flex items-center gap-3">
                <Amount value={s.amount} plain className="text-sm font-medium" />
                {s.journalEntryId && (
                  <RecordLink onClick={() => onOpenJournal(s.journalEntryId!)} className="text-xs">
                    View journal
                  </RecordLink>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </RecordDetailSection>
  );
}
