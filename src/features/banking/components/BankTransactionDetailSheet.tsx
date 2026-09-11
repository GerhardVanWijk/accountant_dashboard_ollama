import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BankAccount } from '@/types';
import { RecordDetailSheet, RelatedRecordsSection, type RelatedRecordItem } from '@/components/app/record-detail-sheet';
import { RecordAuditHistorySection } from '@/components/app/record-audit-history';
import { RecordLink } from '@/components/app/record-link';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/shadcn/button';
import { BankTransactionDetail } from './BankTransactionDetail';
import type { BankTransactionWithAllocations } from '../types';

export interface BankTransactionDetailSheetProps {
  transaction: BankTransactionWithAllocations | undefined;
  isLoading: boolean;
  bankAccount: BankAccount | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAllocate?: () => void;
  /** Resolves a `matchedEntityId` (a `LeaseAmortizationEntry` id, per migration 0097) to its owning lease's id + period label, so the "Settles" link can open the exact lease. Omit to fall back to the amortization history list. */
  resolveLeaseAmortizationEntry?: (entryId: string) => { leaseId: string; periodEnd: string } | undefined;
}

/**
 * The traceability chain the audit called out by name: a bank transaction
 * should expose its GL journal, its finalized reconciliation (once cleared),
 * and — for a transfer leg — its paired transaction on the other account.
 *
 * `matchedEntityId` alone is deliberately NOT surfaced as a related record
 * — no service populates a human-readable label for a bare id (see
 * BankTransactionTable's doc comment), so a link built from it alone would
 * either be fake or silently wrong. `matchedEntityType` (migration 0086,
 * set only by the atomic settlement RPCs `settle_payroll_net_pay` /
 * `settle_lease_period_payment` — FINAL PRE-MIGRATION HARDENING, PART A)
 * is the one case this sheet DOES know how to resolve safely: this
 * transaction is the real cash movement that settled a payroll run's Net
 * Pay Payable or ONE lease amortization PERIOD's Lease Payment Clearing
 * balance (PART B — period-traceable, not lease-cumulative), so the
 * target and its label are unambiguous.
 */
export function BankTransactionDetailSheet({ transaction, isLoading, bankAccount, open, onOpenChange, onAllocate, resolveLeaseAmortizationEntry }: BankTransactionDetailSheetProps) {
  const navigate = useNavigate();

  const relatedItems = useMemo<RelatedRecordItem[]>(() => {
    if (!transaction) return [];
    const items: RelatedRecordItem[] = [];
    if (bankAccount) {
      items.push({ label: 'Bank account', value: <RecordLink onClick={() => navigate('/banking/accounts')}>{bankAccount.name}</RecordLink> });
    }
    if (transaction.journalEntryId) {
      items.push({ label: 'GL posting', value: <RecordLink onClick={() => navigate(`/accounting/journals?record=${transaction.journalEntryId}`)}>View journal entry</RecordLink> });
    }
    if (transaction.transferPairId) {
      items.push({ label: 'Transfer pair', value: <RecordLink onClick={() => navigate('/banking/transactions')}>View paired leg</RecordLink> });
    }
    if (transaction.reconciliationId) {
      items.push({ label: 'Reconciliation', value: <RecordLink onClick={() => navigate('/banking/reconciliation')}>View reconciliation</RecordLink> });
    }
    if (transaction.matchedEntityType === 'payroll_run' && transaction.matchedEntityId) {
      items.push({
        label: 'Settles',
        value: <RecordLink onClick={() => navigate(`/payroll/runs?record=${transaction.matchedEntityId}`)}>View payroll run</RecordLink>,
      });
    }
    if (transaction.matchedEntityType === 'lease_amortization_entry' && transaction.matchedEntityId) {
      const resolved = resolveLeaseAmortizationEntry?.(transaction.matchedEntityId);
      items.push({
        label: resolved ? `Settles period ${resolved.periodEnd}` : 'Settles',
        value: resolved ? (
          <RecordLink onClick={() => navigate(`/leases/register?record=${resolved.leaseId}`)}>View lease</RecordLink>
        ) : (
          <RecordLink onClick={() => navigate('/leases/amortization')}>View amortization history</RecordLink>
        ),
      });
    }
    return items;
  }, [transaction, bankAccount, navigate, resolveLeaseAmortizationEntry]);

  const state = isLoading ? 'loading' : transaction ? 'ready' : 'not-found';

  return (
    <RecordDetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={transaction?.description ?? 'Transaction'}
      titleAdornment={transaction ? <StatusBadge status={transaction.status} /> : undefined}
      state={state}
      notFoundMessage="This transaction could not be found — it may have been deleted."
      actions={
        transaction && onAllocate && !transaction.transferPairId ? (
          <Button size="sm" onClick={onAllocate}>
            {transaction.allocations.length > 0 ? 'Edit allocation' : 'Allocate'}
          </Button>
        ) : undefined
      }
    >
      {transaction && (
        <div className="flex flex-col gap-6">
          <BankTransactionDetail transaction={transaction} bankAccount={bankAccount} />
          <RelatedRecordsSection items={relatedItems} />
          <RecordAuditHistorySection recordType="BankTransaction" recordId={transaction.id} />
        </div>
      )}
    </RecordDetailSheet>
  );
}
