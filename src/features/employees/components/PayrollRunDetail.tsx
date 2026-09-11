import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ActivityIcon,
  BanknoteIcon,
  LayersIcon,
  LinkIcon,
  UndoIcon,
  UsersIcon,
  WalletCardsIcon,
} from 'lucide-react';
import type { Account, BankAccount, PayrollRun } from '@/types';
import type { BankTransactionWithAllocations } from '@/features/banking/types';
import { RecordTabs, type RecordTab } from '@/components/app/record-page';
import { RecordDetailField, RecordDetailGrid, RecordDetailSection, RelatedRecordsSection, type RelatedRecordItem } from '@/components/app/record-detail-sheet';
import { RecordAuditHistorySection } from '@/components/app/record-audit-history';
import { RecordLink } from '@/components/app/record-link';
import { StatStrip, StatTile } from '@/components/app/stat-tile';
import { Button } from '@/components/ui/shadcn/button';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { ClearingBalanceCard } from '@/features/banking/components/ClearingBalanceCard';
import { PayslipLinesTable } from './PayslipLinesTable';

export interface PayrollRunDetailProps {
  run: PayrollRun;
  accounts: Account[];
  bankAccounts: BankAccount[];
  /** Every bank transaction that settles THIS run (already filtered to `matchedEntityType === 'payroll_run' && matchedEntityId === run.id`). */
  settlementTransactions: BankTransactionWithAllocations[];
  onOverrideChange?: (employeeId: string, overtime: number, bonus: number) => Promise<void>;
  onOpenJournal: (journalEntryId: string) => void;
  onSettle?: () => void;
  onReverse?: () => void;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function totals(run: PayrollRun) {
  return run.payslips.reduce(
    (acc, p) => ({
      grossPay: round2(acc.grossPay + p.grossPay),
      paye: round2(acc.paye + p.paye),
      uifEmployee: round2(acc.uifEmployee + p.uifEmployee),
      uifEmployer: round2(acc.uifEmployer + p.uifEmployer),
      sdlEmployer: round2(acc.sdlEmployer + p.sdlEmployer),
      deductionsTotal: round2(acc.deductionsTotal + p.deductionsTotal),
      netPay: round2(acc.netPay + p.netPay),
    }),
    { grossPay: 0, paye: 0, uifEmployee: 0, uifEmployer: 0, sdlEmployer: 0, deductionsTotal: 0, netPay: 0 },
  );
}

/**
 * Payroll Run record workspace — brought up to the same `RecordTabs`
 * standard as Fixed Assets/Leases (`AssetDetail.tsx`), replacing the flat
 * single-panel dialog (Leases + Payroll integrity audit, PART 5, audit
 * item 4/7). Real tab switching via `RecordTabs`' `hidden`-attribute
 * panels — never decorative. No raw UUID is ever rendered as visible text;
 * every id is either a navigation target behind a `RecordLink` or omitted.
 */
export function PayrollRunDetail({ run, accounts, bankAccounts, settlementTransactions, onOverrideChange, onOpenJournal, onSettle, onReverse }: PayrollRunDetailProps) {
  const navigate = useNavigate();
  const t = totals(run);
  const clearingAccount = accounts.find((a) => a.id === run.contraAccountId);
  const clearingAccountLabel = clearingAccount ? `${clearingAccount.code} · ${clearingAccount.name}` : 'Net Pay Payable';

  const clearingSettlements = useMemo(
    () =>
      settlementTransactions.map((tx) => ({
        id: tx.id,
        date: tx.date,
        amount: tx.amount,
        bankAccountName: bankAccounts.find((a) => a.id === tx.bankAccountId)?.name ?? 'Bank account',
        journalEntryId: tx.journalEntryId,
      })),
    [settlementTransactions, bankAccounts],
  );

  const overview = (
    <>
      <StatStrip columns={4}>
        <StatTile variant="compact" icon={UsersIcon} label="Employees" value={String(run.payslips.length)} />
        <StatTile variant="compact" icon={WalletCardsIcon} label="Gross pay" value={formatCurrency(t.grossPay)} />
        <StatTile variant="compact" icon={BanknoteIcon} label="Net pay" value={formatCurrency(t.netPay)} />
        <StatTile variant="compact" icon={LayersIcon} label="Statutory liability" value={formatCurrency(t.paye + t.uifEmployee + t.uifEmployer + t.sdlEmployer)} tone="warning" />
      </StatStrip>

      {run.reversedAt && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <p className="font-medium">This run was reversed on {formatDate(run.reversedAt)}.</p>
          <p className="mt-0.5">{run.reversalReason}</p>
        </div>
      )}

      <RecordDetailGrid>
        <RecordDetailField label="Run number" value={<span className="font-mono">{run.runNumber}</span>} />
        <RecordDetailField label="Pay period" value={`${formatDate(run.payPeriodStart)} – ${formatDate(run.payPeriodEnd)}`} />
        <RecordDetailField label="Pay date" value={formatDate(run.payDate)} />
        <RecordDetailField label="Status" value={run.status === 'posted' ? (run.reversedAt ? 'Posted (reversed)' : 'Posted') : 'Draft'} />
      </RecordDetailGrid>

      {run.status === 'posted' && !run.reversedAt && onReverse && (
        <RecordDetailSection title="Correction">
          <p className="mb-3 text-sm text-muted-foreground">
            A posted run's payslips are immutable. If this run needs correcting, reverse it — the original journal and
            payslips are preserved permanently, and a new run can then be created for the freed pay period.
          </p>
          <Button variant="destructive" size="sm" onClick={onReverse}>
            <UndoIcon data-icon="inline-start" />
            Reverse Run
          </Button>
        </RecordDetailSection>
      )}
    </>
  );

  const payslipsTab = <PayslipLinesTable run={run} onOverrideChange={onOverrideChange} />;

  const accountingTab = (
    <>
      <RecordDetailSection title="PAYE / UIF / SDL breakdown">
        <RecordDetailGrid>
          <RecordDetailField label="PAYE" value={formatCurrency(t.paye)} />
          <RecordDetailField label="UIF — Employee" value={formatCurrency(t.uifEmployee)} />
          <RecordDetailField label="UIF — Employer" value={formatCurrency(t.uifEmployer)} />
          <RecordDetailField label="SDL" value={formatCurrency(t.sdlEmployer)} />
          <RecordDetailField label="Other deductions" value={formatCurrency(t.deductionsTotal)} />
          <RecordDetailField label="Net pay" value={formatCurrency(t.netPay)} />
        </RecordDetailGrid>
      </RecordDetailSection>

      <RecordDetailSection title="Journals">
        <dl className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border text-sm">
          {run.journalEntryId ? (
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <dt className="text-xs text-muted-foreground">Posting</dt>
              <dd><RecordLink onClick={() => onOpenJournal(run.journalEntryId!)}>View journal</RecordLink></dd>
            </div>
          ) : (
            <div className="px-3 py-2.5 text-xs text-muted-foreground">Not yet posted.</div>
          )}
          {run.reversalJournalEntryId && (
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <dt className="text-xs text-muted-foreground">Reversal</dt>
              <dd><RecordLink onClick={() => onOpenJournal(run.reversalJournalEntryId!)}>View journal</RecordLink></dd>
            </div>
          )}
        </dl>
      </RecordDetailSection>
    </>
  );

  const paymentsTab =
    run.status === 'posted' ? (
      <ClearingBalanceCard
        title="Net pay settlement"
        clearingAccountLabel={clearingAccountLabel}
        originalAmount={t.netPay}
        settlements={clearingSettlements}
        onOpenJournal={onOpenJournal}
        onSettle={run.reversedAt ? undefined : onSettle}
      />
    ) : (
      <p className="text-sm text-muted-foreground">Net pay has no clearing balance until this run is posted.</p>
    );

  const relatedItems: RelatedRecordItem[] = [];
  if (run.journalEntryId) {
    relatedItems.push({ label: 'Posting journal', value: <RecordLink onClick={() => onOpenJournal(run.journalEntryId!)}>View journal entry</RecordLink> });
  }
  if (run.reversalJournalEntryId) {
    relatedItems.push({ label: 'Reversal journal', value: <RecordLink onClick={() => onOpenJournal(run.reversalJournalEntryId!)}>View journal entry</RecordLink> });
  }
  clearingSettlements.forEach((s, i) => {
    relatedItems.push({
      label: clearingSettlements.length > 1 ? `Bank settlement #${i + 1}` : 'Bank settlement',
      value: `${s.bankAccountName} — ${formatCurrency(s.amount)} on ${formatDate(s.date)}`,
    });
  });
  relatedItems.push({
    label: 'EMP201 period',
    value: <RecordLink onClick={() => navigate('/payroll/emp201')}>View EMP201</RecordLink>,
  });

  const tabs: RecordTab[] = [
    { value: 'overview', label: 'Overview', icon: LayersIcon, content: overview },
    { value: 'payslips', label: 'Employees & Payslips', icon: UsersIcon, count: run.payslips.length, content: payslipsTab },
    { value: 'accounting', label: 'Accounting', icon: BanknoteIcon, content: accountingTab },
    { value: 'payments', label: 'Payments', icon: WalletCardsIcon, content: paymentsTab },
    { value: 'related', label: 'Related Records', icon: LinkIcon, count: relatedItems.length, content: <RelatedRecordsSection items={relatedItems} /> },
    { value: 'activity', label: 'Audit', icon: ActivityIcon, content: <RecordAuditHistorySection recordType="PayrollRun" recordId={run.id} /> },
  ];

  return <RecordTabs tabs={tabs} embedded ariaLabel={`${run.runNumber} sections`} />;
}
